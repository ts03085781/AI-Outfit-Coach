import { createHmac } from "node:crypto";

export type AbuseGuardEndpoint = "photoCheck" | "analyze" | "followUp";

type WindowBudget = {
  limit: number;
  windowMs: number;
};

export type AbuseGuardConfig = Record<AbuseGuardEndpoint, {
  burst: WindowBudget;
  sustained: WindowBudget;
}>;

type AllowedDecision = {
  allowed: true;
  release: () => void;
};

type BlockedDecision = {
  allowed: false;
  response: Response;
};

export type AbuseGuardDecision = AllowedDecision | BlockedDecision;

export interface AbuseGuard {
  enter(request: Request, endpoint: AbuseGuardEndpoint): AbuseGuardDecision;
}

type Counter = {
  count: number;
  startedAt: number;
};

type ClientBudget = {
  burst: Counter;
  sustained: Counter;
};

const DEFAULT_CONFIG: AbuseGuardConfig = {
  photoCheck: {
    burst: { limit: 5, windowMs: 10_000 },
    sustained: { limit: 30, windowMs: 10 * 60_000 },
  },
  analyze: {
    burst: { limit: 3, windowMs: 10_000 },
    sustained: { limit: 20, windowMs: 10 * 60_000 },
  },
  followUp: {
    burst: { limit: 6, windowMs: 10_000 },
    sustained: { limit: 60, windowMs: 10 * 60_000 },
  },
};

function json(body: object, status: number, retryAfter?: number): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (retryAfter !== undefined) headers.set("retry-after", String(retryAfter));
  return Response.json(body, { status, headers });
}

function retryAfterSeconds(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 1_000));
}

export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site" || fetchSite === "same-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function hashClientSignal(request: Request, secret: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const signal = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || forwarded
    || "shared-anonymous-client";

  return createHmac("sha256", secret).update(`rate-limit-v1:${signal}`).digest("base64url");
}

function resetExpiredCounter(counter: Counter, budget: WindowBudget, now: number): void {
  if (now - counter.startedAt >= budget.windowMs) {
    counter.count = 0;
    counter.startedAt = now;
  }
}

export function createInMemoryAbuseGuard(options: {
  secret: string;
  config?: AbuseGuardConfig;
  globalConcurrency?: number;
  now?: () => number;
}): AbuseGuard {
  if (!options.secret) throw new Error("RATE_LIMIT_SECRET is required");

  const config = options.config ?? DEFAULT_CONFIG;
  const globalConcurrency = options.globalConcurrency ?? 6;
  const now = options.now ?? Date.now;
  const clients = new Map<AbuseGuardEndpoint, Map<string, ClientBudget>>([
    ["photoCheck", new Map()],
    ["analyze", new Map()],
    ["followUp", new Map()],
  ]);
  let activeRequests = 0;

  return {
    enter(request, endpoint) {
      if (!isSameOriginRequest(request)) {
        return { allowed: false, response: json({ error: "CROSS_SITE_REQUEST" }, 403) };
      }

      if (activeRequests >= globalConcurrency) {
        return {
          allowed: false,
          response: json({ error: "RATE_LIMITED" }, 429, 1),
        };
      }

      const timestamp = now();
      const endpointConfig = config[endpoint];
      const endpointClients = clients.get(endpoint)!;

      for (const [key, value] of endpointClients) {
        const burstExpired = timestamp - value.burst.startedAt >= endpointConfig.burst.windowMs;
        const sustainedExpired = timestamp - value.sustained.startedAt >= endpointConfig.sustained.windowMs;
        if (burstExpired && sustainedExpired) endpointClients.delete(key);
      }

      const clientKey = hashClientSignal(request, options.secret);
      const budget = endpointClients.get(clientKey) ?? {
        burst: { count: 0, startedAt: timestamp },
        sustained: { count: 0, startedAt: timestamp },
      };
      resetExpiredCounter(budget.burst, endpointConfig.burst, timestamp);
      resetExpiredCounter(budget.sustained, endpointConfig.sustained, timestamp);

      const burstRemainingMs = budget.burst.startedAt + endpointConfig.burst.windowMs - timestamp;
      if (budget.burst.count >= endpointConfig.burst.limit) {
        return {
          allowed: false,
          response: json(
            { error: "RATE_LIMITED" },
            429,
            retryAfterSeconds(burstRemainingMs),
          ),
        };
      }

      const sustainedRemainingMs = budget.sustained.startedAt
        + endpointConfig.sustained.windowMs
        - timestamp;
      if (budget.sustained.count >= endpointConfig.sustained.limit) {
        return {
          allowed: false,
          response: json(
            { error: "RATE_LIMITED" },
            429,
            retryAfterSeconds(sustainedRemainingMs),
          ),
        };
      }

      budget.burst.count += 1;
      budget.sustained.count += 1;
      endpointClients.set(clientKey, budget);
      activeRequests += 1;
      let released = false;

      return {
        allowed: true,
        release: () => {
          if (released) return;
          released = true;
          activeRequests -= 1;
        },
      };
    },
  };
}

let defaultGuard: AbuseGuard | undefined;
let defaultSecret: string | undefined;

export const configuredAbuseGuard: AbuseGuard = {
  enter(request, endpoint) {
    const secret = process.env.RATE_LIMIT_SECRET;
    if (!secret) {
      return {
        allowed: false,
        response: json({ error: "RATE_LIMIT_UNAVAILABLE" }, 503),
      };
    }

    if (!defaultGuard || defaultSecret !== secret) {
      defaultSecret = secret;
      defaultGuard = createInMemoryAbuseGuard({ secret });
    }
    return defaultGuard.enter(request, endpoint);
  },
};

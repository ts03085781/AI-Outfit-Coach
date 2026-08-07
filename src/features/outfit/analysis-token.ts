import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { OutfitAnalysis } from "./domain";

const DEFAULT_TTL_MS = 10 * 60_000;
const MAX_TOKEN_LENGTH = 1_024;

type TokenPayload = {
  v: 1;
  exp: number;
  analysisHash: string;
};

export interface AnalysisTokenService {
  issue(analysis: OutfitAnalysis): string;
  verify(analysis: OutfitAnalysis, token: string): boolean;
}

export class AnalysisTokenUnavailableError extends Error {
  constructor() {
    super("Analysis token secret is unavailable");
    this.name = "AnalysisTokenUnavailableError";
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function hashAnalysis(analysis: OutfitAnalysis): string {
  return createHash("sha256").update(canonicalJson(analysis)).digest("hex");
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAnalysisTokenService(options: {
  secret: string;
  now?: () => number;
  ttlMs?: number;
}): AnalysisTokenService {
  if (!options.secret) throw new AnalysisTokenUnavailableError();

  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  return {
    issue(analysis) {
      const payload: TokenPayload = {
        v: 1,
        exp: now() + ttlMs,
        analysisHash: hashAnalysis(analysis),
      };
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
      return `${encodedPayload}.${signature(encodedPayload, options.secret)}`;
    },

    verify(analysis, token) {
      if (!token || token.length > MAX_TOKEN_LENGTH) return false;
      const parts = token.split(".");
      if (parts.length !== 2) return false;
      const [encodedPayload, suppliedSignature] = parts;

      try {
        const expectedSignature = signature(encodedPayload, options.secret);
        const suppliedBytes = Buffer.from(suppliedSignature, "base64url");
        const expectedBytes = Buffer.from(expectedSignature, "base64url");
        if (
          suppliedBytes.length !== expectedBytes.length
          || !timingSafeEqual(suppliedBytes, expectedBytes)
        ) {
          return false;
        }

        const payload = JSON.parse(
          Buffer.from(encodedPayload, "base64url").toString("utf8"),
        ) as Partial<TokenPayload>;
        return payload.v === 1
          && typeof payload.exp === "number"
          && Number.isSafeInteger(payload.exp)
          && payload.exp > now()
          && typeof payload.analysisHash === "string"
          && payload.analysisHash === hashAnalysis(analysis);
      } catch {
        return false;
      }
    },
  };
}

function configuredService(): AnalysisTokenService {
  const secret = process.env.ANALYSIS_TOKEN_SECRET;
  if (!secret) throw new AnalysisTokenUnavailableError();
  return createAnalysisTokenService({ secret });
}

export const configuredAnalysisTokenService: AnalysisTokenService = {
  issue: (analysis) => configuredService().issue(analysis),
  verify: (analysis, token) => {
    try {
      return configuredService().verify(analysis, token);
    } catch {
      return false;
    }
  },
};

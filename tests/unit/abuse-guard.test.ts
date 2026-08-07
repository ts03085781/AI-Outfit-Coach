// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createInMemoryAbuseGuard } from "@/lib/abuse-guard";

const testConfig = {
  analyze: {
    burst: { limit: 2, windowMs: 1_000 },
    sustained: { limit: 3, windowMs: 10_000 },
  },
  followUp: {
    burst: { limit: 3, windowMs: 1_000 },
    sustained: { limit: 5, windowMs: 10_000 },
  },
};

function request(headers: HeadersInit = {}) {
  return new Request("https://coach.example/api/analyze", {
    method: "POST",
    headers: {
      origin: "https://coach.example",
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": "203.0.113.42",
      ...headers,
    },
  });
}

describe("in-memory abuse guard", () => {
  it("allows requests within endpoint-specific burst and sustained budgets", () => {
    const guard = createInMemoryAbuseGuard({
      secret: "test-rate-secret",
      config: testConfig,
      globalConcurrency: 4,
    });

    const first = guard.enter(request(), "analyze");
    const second = guard.enter(request(), "analyze");

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    if (first.allowed) first.release();
    if (second.allowed) second.release();
  });

  it("returns 429 with Retry-After when the burst budget is exceeded", () => {
    const guard = createInMemoryAbuseGuard({
      secret: "test-rate-secret",
      config: testConfig,
      globalConcurrency: 4,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const decision = guard.enter(request(), "analyze");
      expect(decision.allowed).toBe(true);
      if (decision.allowed) decision.release();
    }

    const blocked = guard.enter(request(), "analyze");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.response.status).toBe(429);
      expect(blocked.response.headers.get("retry-after")).toBe("1");
    }
  });

  it("expires burst entries but still enforces the sustained budget", () => {
    let now = 0;
    const guard = createInMemoryAbuseGuard({
      secret: "test-rate-secret",
      config: testConfig,
      globalConcurrency: 4,
      now: () => now,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const decision = guard.enter(request(), "analyze");
      if (decision.allowed) decision.release();
    }
    now = 1_001;
    const third = guard.enter(request(), "analyze");
    expect(third.allowed).toBe(true);
    if (third.allowed) third.release();

    now = 2_002;
    const sustainedBlocked = guard.enter(request(), "analyze");
    expect(sustainedBlocked.allowed).toBe(false);
    if (!sustainedBlocked.allowed) {
      expect(sustainedBlocked.response.status).toBe(429);
      expect(sustainedBlocked.response.headers.get("retry-after")).toBe("8");
    }

    now = 10_001;
    const expired = guard.enter(request(), "analyze");
    expect(expired.allowed).toBe(true);
    if (expired.allowed) expired.release();
  });

  it("shares a global concurrency ceiling across endpoints", () => {
    const guard = createInMemoryAbuseGuard({
      secret: "test-rate-secret",
      config: testConfig,
      globalConcurrency: 1,
    });

    const analyze = guard.enter(request(), "analyze");
    const followUp = guard.enter(
      new Request("https://coach.example/api/follow-up", { method: "POST" }),
      "followUp",
    );

    expect(analyze.allowed).toBe(true);
    expect(followUp.allowed).toBe(false);
    if (!followUp.allowed) {
      expect(followUp.response.status).toBe(429);
      expect(followUp.response.headers.get("retry-after")).toBe("1");
    }
    if (analyze.allowed) analyze.release();
    expect(guard.enter(request(), "followUp").allowed).toBe(true);
  });

  it("keeps analysis and follow-up rate counters in separate endpoint budgets", () => {
    const guard = createInMemoryAbuseGuard({
      secret: "test-rate-secret",
      config: {
        analyze: {
          burst: { limit: 2, windowMs: 1_000 },
          sustained: { limit: 2, windowMs: 10_000 },
        },
        followUp: {
          burst: { limit: 1, windowMs: 1_000 },
          sustained: { limit: 1, windowMs: 10_000 },
        },
      },
      globalConcurrency: 4,
    });

    const firstFollowUp = guard.enter(request(), "followUp");
    if (firstFollowUp.allowed) firstFollowUp.release();
    expect(guard.enter(request(), "followUp").allowed).toBe(false);
    expect(guard.enter(request(), "analyze").allowed).toBe(true);
  });

  it("rejects cross-site browser requests without retaining the raw client signal", () => {
    const guard = createInMemoryAbuseGuard({
      secret: "test-rate-secret",
      config: testConfig,
      globalConcurrency: 4,
    });

    const blocked = guard.enter(request({
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    }), "analyze");

    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.response.status).toBe(403);
    expect(JSON.stringify(guard)).not.toContain("203.0.113.42");
  });
});

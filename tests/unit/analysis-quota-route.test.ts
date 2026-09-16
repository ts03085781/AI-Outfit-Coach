// @vitest-environment node

import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { QuotaUnavailableError, type AnalysisQuotaService } from "@/features/outfit/analysis-quota";
import { createAuthenticatedAnalysisQuotaRoute } from "@/features/outfit/authenticated-analysis-quota-route";

const quota = {
  limit: 3,
  used: 3,
  remaining: 0,
  resetAt: "2026-09-01T16:00:00.000Z",
  reservedCount: 0,
  reservationId: "must-not-leak",
} as const;

function serviceWithGet(
  get: AnalysisQuotaService["get"],
): AnalysisQuotaService {
  return {
    get,
    reserve: vi.fn(),
    complete: vi.fn(),
    release: vi.fn(),
  };
}

describe("GET /api/analysis-quota", () => {
  it("returns the public quota summary for the verified user without caching", async () => {
    const get = vi.fn(async () => quota);
    const service = serviceWithGet(get);
    const response = await createAuthenticatedAnalysisQuotaRoute(
      async () => ({ id: "user-1" } as User),
      service,
      async () => ({ isActive: false, currentPeriodEnd: null }),
    )(new Request("http://localhost/api/analysis-quota"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      limit: 3,
      used: 3,
      remaining: 0,
      resetAt: "2026-09-01T16:00:00.000Z",
    });
    expect(get).toHaveBeenCalledWith("user-1");
  });

  it("rejects an anonymous request before querying quota", async () => {
    const get = vi.fn(async () => quota);
    const response = await createAuthenticatedAnalysisQuotaRoute(
      async () => null,
      serviceWithGet(get),
    )(new Request("http://localhost/api/analysis-quota"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
    expect(get).not.toHaveBeenCalled();
  });

  it("fails closed without exposing quota-service details", async () => {
    const service = serviceWithGet(vi.fn(async () => {
      throw new QuotaUnavailableError();
    }));
    const response = await createAuthenticatedAnalysisQuotaRoute(
      async () => ({ id: "user-1" } as User),
      service,
      async () => ({ isActive: false, currentPeriodEnd: null }),
    )(new Request("http://localhost/api/analysis-quota"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "QUOTA_UNAVAILABLE" });
  });

  it("fails closed for an unexpected quota-service exception", async () => {
    const service = serviceWithGet(vi.fn(async () => {
      throw new Error("sensitive database failure");
    }));
    const response = await createAuthenticatedAnalysisQuotaRoute(
      async () => ({ id: "user-1" } as User),
      service,
      async () => ({ isActive: false, currentPeriodEnd: null }),
    )(new Request("http://localhost/api/analysis-quota"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "QUOTA_UNAVAILABLE" });
  });
});


it("returns unlimited access without reading exhausted free quota", async () => {
  const get = vi.fn(async () => quota);
  const response = await createAuthenticatedAnalysisQuotaRoute(
    async () => ({ id: "subscriber" } as User), serviceWithGet(get),
    async () => ({ isActive: true, currentPeriodEnd: "2026-10-10T00:00:00.000Z" }),
  )(new Request("http://localhost/api/analysis-quota"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ type: "subscription", unlimited: true, currentPeriodEnd: "2026-10-10T00:00:00.000Z" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(get).not.toHaveBeenCalled();
});

it("does not fall back to free quota on subscription database failure", async () => {
  const get = vi.fn(async () => quota);
  const response = await createAuthenticatedAnalysisQuotaRoute(
    async () => ({ id: "subscriber" } as User), serviceWithGet(get),
    async () => { throw new Error("DB failure"); },
  )(new Request("http://localhost/api/analysis-quota"));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "QUOTA_UNAVAILABLE" });
  expect(get).not.toHaveBeenCalled();
});

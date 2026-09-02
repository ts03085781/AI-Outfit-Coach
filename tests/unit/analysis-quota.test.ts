// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  QuotaUnavailableError,
} from "@/features/outfit/analysis-quota";
import {
  createAnalysisQuotaService,
  createThrowingAnalysisQuotaRpc,
  type AnalysisQuotaRpc,
} from "@/features/outfit/analysis-quota-service";

const quotaRow = {
  limit_count: 3,
  used_count: 2,
  reserved_count: 0,
  remaining_count: 1,
  available_now_count: 1,
  reset_at: "2026-09-01T16:00:00.000Z",
};

const quotaSummary = {
  limit: 3,
  used: 2,
  remaining: 1,
  resetAt: "2026-09-01T16:00:00.000Z",
};

function rpcReturning(data: unknown): AnalysisQuotaRpc {
  return vi.fn(async () => ({ data, error: null }));
}

describe("analysis quota service", () => {
  it("maps the exact quota row to the public summary", async () => {
    const rpc = rpcReturning([quotaRow]);
    const service = createAnalysisQuotaService(rpc);

    await expect(service.get("user-1")).resolves.toEqual(quotaSummary);
    expect(rpc).toHaveBeenCalledWith("get_daily_analysis_quota", {
      p_user_id: "user-1",
    });
  });

  it.each([
    { name: "no rows", data: [] },
    { name: "multiple rows", data: [quotaRow, quotaRow] },
    { name: "an extra column", data: [{ ...quotaRow, private_note: "leak" }] },
    { name: "a non-three limit", data: [{ ...quotaRow, limit_count: 4 }] },
    { name: "an invalid reset timestamp", data: [{ ...quotaRow, reset_at: "tomorrow" }] },
    { name: "inconsistent remaining quota", data: [{ ...quotaRow, remaining_count: 0 }] },
    {
      name: "more reservations than remaining capacity",
      data: [{
        ...quotaRow,
        reserved_count: 2,
        available_now_count: 0,
      }],
    },
  ])("rejects malformed quota data with $name", async ({ data }) => {
    const service = createAnalysisQuotaService(rpcReturning(data));

    await expect(service.get("user-1")).rejects.toBeInstanceOf(QuotaUnavailableError);
  });

  it.each([
    ["daily_limit_reached", "daily_limit_reached", {
      ...quotaRow,
      used_count: 3,
      remaining_count: 0,
      available_now_count: 0,
    }],
    ["slots_busy", "slots_busy", {
      ...quotaRow,
      reserved_count: 1,
      available_now_count: 0,
    }],
  ] as const)("maps the %s reservation denial", async (outcome, status, counts) => {
    const rpc = rpcReturning([{
      outcome,
      reservation_id: "reservation-1",
      ...counts,
    }]);
    const service = createAnalysisQuotaService(rpc);

    await expect(service.reserve("user-1", "reservation-1")).resolves.toEqual({
      status,
      quota: {
        ...quotaSummary,
        used: counts.used_count,
        remaining: counts.remaining_count,
      },
    });
  });

  it.each([
    {
      name: "daily limit before three completed uses",
      outcome: "daily_limit_reached",
      counts: quotaRow,
    },
    {
      name: "busy slots while capacity is available",
      outcome: "slots_busy",
      counts: quotaRow,
    },
    {
      name: "a reservation without a live reserved slot",
      outcome: "reserved",
      counts: quotaRow,
    },
  ])("rejects an inconsistent reservation outcome: $name", async ({ outcome, counts }) => {
    const service = createAnalysisQuotaService(rpcReturning([{
      outcome,
      reservation_id: "reservation-1",
      ...counts,
    }]));

    await expect(service.reserve("user-1", "reservation-1")).rejects.toBeInstanceOf(
      QuotaUnavailableError,
    );
  });

  it("returns a reserved result without exposing internal quota fields", async () => {
    const rpc = rpcReturning([{
      outcome: "reserved",
      reservation_id: "reservation-1",
      ...quotaRow,
      reserved_count: 1,
      available_now_count: 0,
    }]);
    const service = createAnalysisQuotaService(rpc);

    await expect(service.reserve("user-1", "reservation-1")).resolves.toEqual({
      status: "reserved",
      reservationId: "reservation-1",
      quota: quotaSummary,
    });
    expect(rpc).toHaveBeenCalledWith("reserve_daily_analysis", {
      p_user_id: "user-1",
      p_reservation_id: "reservation-1",
    });
  });

  it("rejects a mismatched reservation identifier", async () => {
    const service = createAnalysisQuotaService(rpcReturning([{
      outcome: "reserved",
      reservation_id: "reservation-other",
      ...quotaRow,
    }]));

    await expect(service.reserve("user-1", "reservation-1")).rejects.toBeInstanceOf(
      QuotaUnavailableError,
    );
  });

  it("retries one thrown transport failure with the same reservation arguments", async () => {
    const rpc = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        data: [{
          outcome: "reserved",
          reservation_id: "reservation-1",
          ...quotaRow,
          reserved_count: 1,
          available_now_count: 0,
        }],
        error: null,
      });
    const service = createAnalysisQuotaService(rpc);

    await expect(service.reserve("user-1", "reservation-1")).resolves.toMatchObject({
      status: "reserved",
      reservationId: "reservation-1",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "reserve_daily_analysis", {
      p_user_id: "user-1",
      p_reservation_id: "reservation-1",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "reserve_daily_analysis", {
      p_user_id: "user-1",
      p_reservation_id: "reservation-1",
    });
  });

  it("uses the production throwing RPC seam so a lost response is retried", async () => {
    const firstBuilder = {
      throwOnError: vi.fn(() => Promise.reject(new TypeError("fetch failed"))),
    };
    const secondBuilder = {
      throwOnError: vi.fn(async () => ({
        data: [{
          outcome: "reserved",
          reservation_id: "reservation-1",
          ...quotaRow,
          reserved_count: 1,
          available_now_count: 0,
        }],
        error: null,
      })),
    };
    const client = {
      rpc: vi.fn()
        .mockReturnValueOnce(firstBuilder)
        .mockReturnValueOnce(secondBuilder),
    };
    const service = createAnalysisQuotaService(createThrowingAnalysisQuotaRpc(client));

    await expect(service.reserve("user-1", "reservation-1")).resolves.toMatchObject({
      status: "reserved",
      reservationId: "reservation-1",
    });
    expect(client.rpc).toHaveBeenCalledTimes(2);
    expect(firstBuilder.throwOnError).toHaveBeenCalledOnce();
    expect(secondBuilder.throwOnError).toHaveBeenCalledOnce();
  });

  it("does not retry a database rejection from the production throwing RPC seam", async () => {
    const databaseError = Object.assign(
      new Error("permission denied for user-sensitive reservation-sensitive"),
      { code: "42501" },
    );
    const builder = {
      throwOnError: vi.fn(() => Promise.reject(databaseError)),
    };
    const client = { rpc: vi.fn(() => builder) };
    const diagnostic = vi.fn();
    const service = createAnalysisQuotaService(
      createThrowingAnalysisQuotaRpc(client),
      diagnostic,
    );

    await expect(service.reserve("user-sensitive", "reservation-sensitive")).rejects.toBeInstanceOf(
      QuotaUnavailableError,
    );
    expect(client.rpc).toHaveBeenCalledOnce();
    expect(builder.throwOnError).toHaveBeenCalledOnce();
    expect(diagnostic).toHaveBeenCalledWith("analysis_quota_rpc_error", {
      operation: "reserve_daily_analysis",
      category: "database_exception",
      code: "42501",
    });
    const logged = JSON.stringify(diagnostic.mock.calls);
    expect(logged).not.toContain("user-sensitive");
    expect(logged).not.toContain("reservation-sensitive");
    expect(logged).not.toContain("permission denied");
  });

  it("does not retry a resolved Postgres error", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for user-sensitive reservation-sensitive",
      },
    }));
    const diagnostic = vi.fn();
    const service = createAnalysisQuotaService(rpc, diagnostic);

    await expect(service.reserve("user-sensitive", "reservation-sensitive")).rejects.toBeInstanceOf(
      QuotaUnavailableError,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(diagnostic).toHaveBeenCalledWith("analysis_quota_rpc_error", {
      operation: "reserve_daily_analysis",
      category: "database_response",
      code: "42501",
    });
    const logged = JSON.stringify(diagnostic.mock.calls);
    expect(logged).not.toContain("user-sensitive");
    expect(logged).not.toContain("reservation-sensitive");
    expect(logged).not.toContain("permission denied");
  });

  it("replaces an unrecognized error code instead of logging its raw value", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "reservation_sensitive",
        message: "user-sensitive",
      },
    }));
    const diagnostic = vi.fn();
    const service = createAnalysisQuotaService(rpc, diagnostic);

    await expect(service.get("user-sensitive")).rejects.toBeInstanceOf(QuotaUnavailableError);
    expect(diagnostic).toHaveBeenCalledWith("analysis_quota_rpc_error", {
      operation: "get_daily_analysis_quota",
      category: "database_response",
      code: "UNKNOWN",
    });
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("sensitive");
  });

  it("accepts an idempotent completed outcome and maps its quota", async () => {
    const rpc = rpcReturning([{
      outcome: "completed",
      reservation_id: "reservation-1",
      ...quotaRow,
    }]);
    const service = createAnalysisQuotaService(rpc);

    await expect(service.complete("user-1", "reservation-1")).resolves.toEqual(quotaSummary);
    await expect(service.complete("user-1", "reservation-1")).resolves.toEqual(quotaSummary);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("accepts a completed pre-midnight reservation with the new day's empty summary", async () => {
    const service = createAnalysisQuotaService(rpcReturning([{
      outcome: "completed",
      reservation_id: "reservation-1",
      ...quotaRow,
      used_count: 0,
      remaining_count: 3,
      available_now_count: 3,
    }]));

    await expect(service.complete("user-1", "reservation-1")).resolves.toEqual({
      limit: 3,
      used: 0,
      remaining: 3,
      resetAt: "2026-09-01T16:00:00.000Z",
    });
  });

  it.each(["invalid_reservation", "expired_reservation"])(
    "rejects the non-completing %s outcome",
    async (outcome) => {
      const service = createAnalysisQuotaService(rpcReturning([{
        outcome,
        reservation_id: "reservation-1",
        ...quotaRow,
      }]));

      await expect(service.complete("user-1", "reservation-1")).rejects.toBeInstanceOf(
        QuotaUnavailableError,
      );
    },
  );

  it.each(["released", "already_completed"])(
    "accepts the idempotent %s release outcome",
    async (outcome) => {
      const rpc = rpcReturning(outcome);
      const service = createAnalysisQuotaService(rpc);

      await expect(service.release("user-1", "reservation-1")).resolves.toBeUndefined();
      expect(rpc).toHaveBeenCalledWith("release_daily_analysis", {
        p_user_id: "user-1",
        p_reservation_id: "reservation-1",
      });
    },
  );

  it("rejects an invalid release outcome", async () => {
    const service = createAnalysisQuotaService(rpcReturning("invalid_reservation"));

    await expect(service.release("user-1", "reservation-1")).rejects.toBeInstanceOf(
      QuotaUnavailableError,
    );
  });
});

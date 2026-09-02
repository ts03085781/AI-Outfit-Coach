// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  QuotaUnavailableError,
} from "@/features/outfit/analysis-quota";
import {
  createAnalysisQuotaService,
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
  ])("rejects malformed quota data with $name", async ({ data }) => {
    const service = createAnalysisQuotaService(rpcReturning(data));

    await expect(service.get("user-1")).rejects.toBeInstanceOf(QuotaUnavailableError);
  });

  it.each([
    ["daily_limit_reached", "daily_limit_reached"],
    ["slots_busy", "slots_busy"],
  ] as const)("maps the %s reservation denial", async (outcome, status) => {
    const rpc = rpcReturning([{
      outcome,
      reservation_id: "reservation-1",
      ...quotaRow,
    }]);
    const service = createAnalysisQuotaService(rpc);

    await expect(service.reserve("user-1", "reservation-1")).resolves.toEqual({
      status,
      quota: quotaSummary,
    });
  });

  it("returns a reserved result without exposing internal quota fields", async () => {
    const rpc = rpcReturning([{
      outcome: "reserved",
      reservation_id: "reservation-1",
      ...quotaRow,
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

  it("does not retry a resolved Postgres error", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "42501", message: "permission denied" },
    }));
    const service = createAnalysisQuotaService(rpc);

    await expect(service.reserve("user-1", "reservation-1")).rejects.toBeInstanceOf(
      QuotaUnavailableError,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
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

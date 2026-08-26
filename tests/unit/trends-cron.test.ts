// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createTrendCronHandler } from "@/features/trends/cron-handler";
import { runDailyTrendUpdate } from "@/features/trends/update-trends";

describe("daily trend update", () => {
  it("publishes research then cleans old runs", async () => {
    const research = { items: [] } as never;
    const manifest = { runId: "run-current", items: [] } as never;
    const deps = {
      research: vi.fn(async () => research),
      generateImage: vi.fn(),
      publish: vi.fn(async () => manifest),
      cleanup: vi.fn(async () => ["old/path"]),
      now: () => new Date("2026-08-26T22:00:00.000Z"),
      log: vi.fn(),
    };

    await expect(runDailyTrendUpdate(deps)).resolves.toEqual({
      runId: "run-current",
      itemCount: 0,
      deletedCount: 1,
    });
    expect(deps.publish).toHaveBeenCalledWith(expect.objectContaining({ research }));
    expect(deps.cleanup).toHaveBeenCalledWith(expect.objectContaining({ currentRunId: "run-current" }));
  });

  it("keeps a successful publication when cleanup fails", async () => {
    const log = vi.fn();
    await expect(runDailyTrendUpdate({
      research: vi.fn(async () => ({ items: [] } as never)),
      generateImage: vi.fn(),
      publish: vi.fn(async () => ({ runId: "run-current", items: [{ id: "one" }] } as never)),
      cleanup: vi.fn(async () => { throw new Error("cleanup unavailable"); }),
      now: () => new Date("2026-08-26T22:00:00.000Z"),
      log,
    })).resolves.toEqual({ runId: "run-current", itemCount: 1, deletedCount: 0 });
    expect(log).toHaveBeenCalledWith("warn", expect.objectContaining({ event: "trend_cleanup_failed" }));
  });
});

describe("GET /api/cron/trends", () => {
  it("rejects requests without the exact CRON_SECRET bearer token", async () => {
    const run = vi.fn();
    const handler = createTrendCronHandler({ secret: "cron-secret", run });

    const response = await handler(new Request("https://example.com/api/cron/trends"));

    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the update for an authorized Vercel Cron request", async () => {
    const run = vi.fn(async () => ({ runId: "run-current", itemCount: 5, deletedCount: 6 }));
    const handler = createTrendCronHandler({ secret: "cron-secret", run });

    const response = await handler(new Request("https://example.com/api/cron/trends", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      runId: "run-current",
      itemCount: 5,
      deletedCount: 6,
    });
  });

  it("returns 500 without leaking provider details", async () => {
    const handler = createTrendCronHandler({
      secret: "cron-secret",
      run: vi.fn(async () => { throw new Error("sensitive provider response"); }),
    });

    const response = await handler(new Request("https://example.com/api/cron/trends", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "TREND_UPDATE_FAILED" });
  });
});

import type { TrendUpdateResult } from "./update-trends";
import { getErrorMetadata } from "./error-metadata";

export function createTrendCronHandler({
  secret,
  run,
}: {
  secret?: string;
  run: () => Promise<TrendUpdateResult>;
}) {
  return async function handleTrendCron(request: Request): Promise<Response> {
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    try {
      const result = await run();
      return Response.json({ ok: true, ...result });
    } catch (error) {
      console.error(JSON.stringify({
        event: "trend_update_failed",
        ...getErrorMetadata(error),
      }));
      return Response.json({ ok: false, error: "TREND_UPDATE_FAILED" }, { status: 500 });
    }
  };
}

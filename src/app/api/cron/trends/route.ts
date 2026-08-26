import { createTrendCronHandler } from "@/features/trends/cron-handler";
import { runDailyTrendUpdate } from "@/features/trends/update-trends";

export const runtime = "nodejs";
export const maxDuration = 300;

export const GET = createTrendCronHandler({
  secret: process.env.CRON_SECRET,
  run: runDailyTrendUpdate,
});

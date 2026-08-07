import { createTelemetryHandler } from "@/lib/telemetry-handler";
import type { SafeEvent } from "@/lib/telemetry";

export const runtime = "nodejs";

function writeMetric(event: SafeEvent): void {
  console.info({ metric: "outfit_event", ...event });
}

export const POST = createTelemetryHandler({ writeMetric });

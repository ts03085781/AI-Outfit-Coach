import { isSameOriginRequest } from "./abuse-guard";
import { TelemetryEventSchema, type SafeEvent } from "./telemetry";

const MAX_TELEMETRY_BYTES = 2_048;

export type TelemetryHandlerDependencies = {
  writeMetric: (event: SafeEvent) => void | Promise<void>;
};

function json(body: object, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function readBodyWithinLimit(
  body: ReadableStream<Uint8Array> | null,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_TELEMETRY_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }

  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function createTelemetryHandler(dependencies: TelemetryHandlerDependencies) {
  return async function telemetryHandler(request: Request): Promise<Response> {
    if (!isSameOriginRequest(request)) return json({ error: "CROSS_SITE_REQUEST" }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return json({ error: "INVALID_TELEMETRY" }, 400);
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_TELEMETRY_BYTES) {
      return json({ error: "INVALID_TELEMETRY" }, 400);
    }

    const bytes = await readBodyWithinLimit(request.body);
    if (!bytes) return json({ error: "INVALID_TELEMETRY" }, 400);

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "INVALID_TELEMETRY" }, 400);
    }
    const event = TelemetryEventSchema.safeParse(body);
    if (!event.success) return json({ error: "INVALID_TELEMETRY" }, 400);

    try {
      await dependencies.writeMetric(event.data);
    } catch {
      return json({ error: "TELEMETRY_UNAVAILABLE" }, 503);
    }
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  };
}

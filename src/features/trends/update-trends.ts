import type { TrendManifest, TrendResearch } from "./domain";
import { getErrorMetadata } from "./error-metadata";
import {
  cleanupOldTrendRuns,
  publishTrendRun,
  vercelTrendBlobClient,
  type TrendBlobClient,
} from "./blob-storage";
import { OpenAITrendGenerator } from "./openai-generator";

type LogLevel = "info" | "warn" | "error";

export type TrendUpdateResult = {
  runId: string;
  itemCount: number;
  deletedCount: number;
};

export type TrendUpdateDependencies = {
  research: () => Promise<TrendResearch>;
  generateImage: (prompt: string) => Promise<Uint8Array>;
  publish: typeof publishTrendRun;
  cleanup: typeof cleanupOldTrendRuns;
  now: () => Date;
  log: (level: LogLevel, payload: Record<string, unknown>) => void;
  client?: TrendBlobClient;
};

function structuredLog(level: LogLevel, payload: Record<string, unknown>): void {
  const message = JSON.stringify(payload);
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.info(message);
}

function defaultDependencies(): TrendUpdateDependencies {
  const generator = new OpenAITrendGenerator();
  return {
    research: () => generator.research(),
    generateImage: (prompt) => generator.generateImage(prompt),
    publish: publishTrendRun,
    cleanup: cleanupOldTrendRuns,
    now: () => new Date(),
    log: structuredLog,
    client: vercelTrendBlobClient,
  };
}

export async function runDailyTrendUpdate(
  dependencies: TrendUpdateDependencies = defaultDependencies(),
): Promise<TrendUpdateResult> {
  const startedAt = Date.now();
  const now = dependencies.now();
  const client = dependencies.client ?? vercelTrendBlobClient;
  dependencies.log("info", { event: "trend_update_started", generatedAt: now.toISOString() });

  let phase: "research" | "publish" = "research";
  let manifest: TrendManifest;
  try {
    const research = await dependencies.research();
    phase = "publish";
    manifest = await dependencies.publish({
      client,
      research,
      generateImage: dependencies.generateImage,
      now,
    });
  } catch (error) {
    dependencies.log("error", {
      event: "trend_update_failed",
      phase,
      ...getErrorMetadata(error),
    });
    throw error;
  }

  let deletedCount = 0;
  try {
    const deleted = await dependencies.cleanup({ client, currentRunId: manifest.runId, now });
    deletedCount = deleted.length;
  } catch (error) {
    dependencies.log("warn", {
      event: "trend_cleanup_failed",
      runId: manifest.runId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  const result = { runId: manifest.runId, itemCount: manifest.items.length, deletedCount };
  dependencies.log("info", {
    event: "trend_update_succeeded",
    ...result,
    durationMs: Date.now() - startedAt,
  });
  return result;
}

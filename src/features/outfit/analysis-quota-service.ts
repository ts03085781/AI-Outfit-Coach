import { z } from "zod";

import {
  DAILY_ANALYSIS_LIMIT,
  DailyQuotaSummarySchema,
  QuotaUnavailableError,
  type AnalysisQuotaService,
  type DailyQuotaSummary,
  type ReserveQuotaResult,
} from "@/features/outfit/analysis-quota";

type RpcError = {
  code?: string;
  message?: string;
};

type RpcResponse = {
  data: unknown;
  error: RpcError | null;
};

type AnalysisQuotaRpcFunction =
  | "get_daily_analysis_quota"
  | "reserve_daily_analysis"
  | "complete_daily_analysis"
  | "release_daily_analysis";

export type AnalysisQuotaRpc = (
  functionName: AnalysisQuotaRpcFunction,
  arguments_: Record<string, string>,
) => PromiseLike<RpcResponse>;

type QuotaDiagnosticCategory =
  | "database_response"
  | "database_exception"
  | "transport_exception"
  | "unexpected_exception";

type QuotaDiagnosticLogger = (
  event: "analysis_quota_rpc_error",
  diagnostic: {
    operation: AnalysisQuotaRpcFunction;
    category: QuotaDiagnosticCategory;
    code: string;
  },
) => void;

type ThrowingRpcBuilder = {
  throwOnError(): PromiseLike<RpcResponse>;
};

type AnalysisQuotaRpcClient = {
  rpc(functionName: AnalysisQuotaRpcFunction, arguments_: Record<string, string>): ThrowingRpcBuilder;
};

const RawQuotaFields = {
  limit_count: z.literal(DAILY_ANALYSIS_LIMIT),
  used_count: z.number().int().min(0).max(DAILY_ANALYSIS_LIMIT),
  reserved_count: z.number().int().min(0).max(DAILY_ANALYSIS_LIMIT),
  remaining_count: z.number().int().min(0).max(DAILY_ANALYSIS_LIMIT),
  available_now_count: z.number().int().min(0).max(DAILY_ANALYSIS_LIMIT),
  reset_at: z.string().datetime({ offset: true }),
} as const;

const RawQuotaSchema = z.object(RawQuotaFields).strict().refine(
  ({ used_count, remaining_count }) => (
    used_count + remaining_count === DAILY_ANALYSIS_LIMIT
  ),
).refine(
  ({ reserved_count, remaining_count }) => reserved_count <= remaining_count,
).refine(
  ({ available_now_count, remaining_count, reserved_count }) => (
    available_now_count === Math.max(0, remaining_count - reserved_count)
  ),
);

const ReserveRowSchema = z.object({
  outcome: z.enum(["reserved", "daily_limit_reached", "slots_busy"]),
  reservation_id: z.string().min(1),
  ...RawQuotaFields,
}).strict().superRefine((row, context) => {
  const totalAllocated = row.used_count + row.reserved_count;
  const consistent = (
    (row.outcome === "daily_limit_reached"
      && row.used_count === DAILY_ANALYSIS_LIMIT
      && row.reserved_count === 0)
    || (row.outcome === "slots_busy"
      && row.used_count < DAILY_ANALYSIS_LIMIT
      && row.reserved_count > 0
      && totalAllocated === DAILY_ANALYSIS_LIMIT)
    || (row.outcome === "reserved"
      && row.reserved_count > 0
      && totalAllocated <= DAILY_ANALYSIS_LIMIT)
  );
  if (!consistent) {
    context.addIssue({
      code: "custom",
      message: "Reservation outcome is inconsistent with quota counts",
    });
  }
});

const CompleteRowSchema = z.object({
  outcome: z.enum(["completed", "invalid_reservation", "expired_reservation"]),
  reservation_id: z.string().min(1),
  ...RawQuotaFields,
}).strict();

const ReleaseOutcomeSchema = z.enum([
  "released",
  "already_completed",
  "invalid_reservation",
]);

function unavailable(): QuotaUnavailableError {
  return new QuotaUnavailableError();
}

function safeErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) return "UNKNOWN";
  const code = error.code;
  return typeof code === "string" && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code)
    ? code
    : "UNKNOWN";
}

const defaultDiagnosticLogger: QuotaDiagnosticLogger = (event, diagnostic) => {
  console.error(event, diagnostic);
};

function reportRpcError(
  logger: QuotaDiagnosticLogger,
  operation: AnalysisQuotaRpcFunction,
  category: QuotaDiagnosticCategory,
  error: unknown,
) {
  try {
    logger("analysis_quota_rpc_error", {
      operation,
      category,
      code: safeErrorCode(error),
    });
  } catch {
    // Diagnostic logging must not replace the quota failure returned to callers.
  }
}

function oneRow<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = z.tuple([schema]).safeParse(data);
  if (!parsed.success) throw unavailable();
  return parsed.data[0];
}

function toSummary(row: z.infer<typeof RawQuotaSchema>): DailyQuotaSummary {
  const parsed = DailyQuotaSummarySchema.safeParse({
    limit: row.limit_count,
    used: row.used_count,
    remaining: row.remaining_count,
    resetAt: row.reset_at,
  });
  if (!parsed.success) throw unavailable();
  return parsed.data;
}

function parseQuota(data: unknown): DailyQuotaSummary {
  return toSummary(oneRow(RawQuotaSchema, data));
}

function parseReservation(
  data: unknown,
  expectedReservationId: string,
): ReserveQuotaResult {
  const row = oneRow(ReserveRowSchema, data);
  const rawQuota = RawQuotaSchema.safeParse({
    limit_count: row.limit_count,
    used_count: row.used_count,
    reserved_count: row.reserved_count,
    remaining_count: row.remaining_count,
    available_now_count: row.available_now_count,
    reset_at: row.reset_at,
  });
  if (!rawQuota.success || row.reservation_id !== expectedReservationId) throw unavailable();

  const quota = toSummary(rawQuota.data);
  if (row.outcome === "reserved") {
    return { status: "reserved", reservationId: row.reservation_id, quota };
  }
  return { status: row.outcome, quota };
}

function parseCompletion(data: unknown, expectedReservationId: string): DailyQuotaSummary {
  const row = oneRow(CompleteRowSchema, data);
  if (row.outcome !== "completed" || row.reservation_id !== expectedReservationId) {
    throw unavailable();
  }

  const rawQuota = RawQuotaSchema.safeParse({
    limit_count: row.limit_count,
    used_count: row.used_count,
    reserved_count: row.reserved_count,
    remaining_count: row.remaining_count,
    available_now_count: row.available_now_count,
    reset_at: row.reset_at,
  });
  if (!rawQuota.success) throw unavailable();
  return toSummary(rawQuota.data);
}

async function invoke(
  rpc: AnalysisQuotaRpc,
  functionName: AnalysisQuotaRpcFunction,
  arguments_: Record<string, string>,
  retryTransportFailure: boolean,
  diagnosticLogger: QuotaDiagnosticLogger,
): Promise<unknown> {
  const attempts = retryTransportFailure ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { data, error } = await rpc(functionName, arguments_);
      if (error) {
        reportRpcError(diagnosticLogger, functionName, "database_response", error);
        throw unavailable();
      }
      return data;
    } catch (error) {
      if (error instanceof TypeError && attempt + 1 < attempts) continue;
      if (error instanceof QuotaUnavailableError) throw error;
      const code = safeErrorCode(error);
      const category = error instanceof TypeError
        ? "transport_exception"
        : code === "UNKNOWN"
          ? "unexpected_exception"
          : "database_exception";
      reportRpcError(diagnosticLogger, functionName, category, error);
      throw unavailable();
    }
  }
  throw unavailable();
}

export function createAnalysisQuotaService(
  rpc: AnalysisQuotaRpc,
  diagnosticLogger: QuotaDiagnosticLogger = defaultDiagnosticLogger,
): AnalysisQuotaService {
  return {
    async get(userId) {
      return parseQuota(await invoke(rpc, "get_daily_analysis_quota", {
        p_user_id: userId,
      }, false, diagnosticLogger));
    },

    async reserve(userId, reservationId) {
      const data = await invoke(rpc, "reserve_daily_analysis", {
        p_user_id: userId,
        p_reservation_id: reservationId,
      }, true, diagnosticLogger);
      return parseReservation(data, reservationId);
    },

    async complete(userId, reservationId) {
      const data = await invoke(rpc, "complete_daily_analysis", {
        p_user_id: userId,
        p_reservation_id: reservationId,
      }, true, diagnosticLogger);
      return parseCompletion(data, reservationId);
    },

    async release(userId, reservationId) {
      const data = await invoke(rpc, "release_daily_analysis", {
        p_user_id: userId,
        p_reservation_id: reservationId,
      }, true, diagnosticLogger);
      const outcome = ReleaseOutcomeSchema.safeParse(data);
      if (!outcome.success || outcome.data === "invalid_reservation") throw unavailable();
    },
  };
}

export function createThrowingAnalysisQuotaRpc(
  client: AnalysisQuotaRpcClient,
): AnalysisQuotaRpc {
  return (functionName, arguments_) => (
    client.rpc(functionName, arguments_).throwOnError()
  );
}

async function createConfiguredService(): Promise<AnalysisQuotaService> {
  try {
    const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
    const client = createAdminSupabaseClient();
    return createAnalysisQuotaService(createThrowingAnalysisQuotaRpc({
      rpc: (functionName, arguments_) => client.rpc(functionName, arguments_),
    }));
  } catch {
    throw unavailable();
  }
}

export const configuredAnalysisQuotaService: AnalysisQuotaService = {
  async get(userId) {
    return (await createConfiguredService()).get(userId);
  },
  async reserve(userId, reservationId) {
    return (await createConfiguredService()).reserve(userId, reservationId);
  },
  async complete(userId, reservationId) {
    return (await createConfiguredService()).complete(userId, reservationId);
  },
  async release(userId, reservationId) {
    return (await createConfiguredService()).release(userId, reservationId);
  },
};

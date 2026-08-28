type ErrorDetails = {
  status?: unknown;
  code?: unknown;
  request_id?: unknown;
  requestId?: unknown;
};

export function getErrorMetadata(error: unknown): Record<string, unknown> {
  const details = error && typeof error === "object" ? error as ErrorDetails : {};
  const metadata: Record<string, unknown> = {
    errorName: error instanceof Error ? error.name : "UnknownError",
  };

  if (error instanceof Error) metadata.errorMessage = error.message;
  if (typeof details.status === "number") metadata.status = details.status;
  if (typeof details.code === "string") metadata.code = details.code;

  const requestId = details.request_id ?? details.requestId;
  if (typeof requestId === "string") metadata.requestId = requestId;

  return metadata;
}

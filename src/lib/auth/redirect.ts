export function safeNextPath(
  value: string | string[] | undefined,
  fallback = "/analyze",
) {
  if (typeof value !== "string") return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) {
    return fallback;
  }
  return decoded;
}

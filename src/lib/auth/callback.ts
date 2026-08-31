import { safeNextPath } from "@/lib/auth/redirect";

type ExchangeCode = (code: string) => Promise<{ error: unknown }>;
type NotifyLogin = () => Promise<unknown>;

export function createAuthCallbackHandler(
  exchangeCode: ExchangeCode,
  notifyLogin: NotifyLogin = async () => undefined,
) {
  return async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!code) return Response.redirect(new URL("/login?error=oauth", url.origin));

    const { error } = await exchangeCode(code).catch(() => ({ error: true }));
    if (error) return Response.redirect(new URL("/login?error=oauth", url.origin));

    await notifyLogin().catch(() => undefined);

    const destination = new URL(safeNextPath(url.searchParams.get("next") ?? undefined), url.origin);
    destination.searchParams.set("login", "success");
    return Response.redirect(destination);
  };
}

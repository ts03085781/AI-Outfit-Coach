import { LoginPanel } from "@/features/auth/components/LoginPanel";
import { safeNextPath } from "@/lib/auth/redirect";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    reason?: string | string[];
    error?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const reason = params.reason === "auth" ? "auth" : undefined;
  const error = params.error === "oauth" ? "oauth" : undefined;

  return <LoginPanel nextPath={safeNextPath(params.next)} reason={reason} error={error} />;
}

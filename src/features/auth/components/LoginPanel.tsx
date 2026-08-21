"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type LoginPanelProps = {
  nextPath: string;
  reason?: "auth";
  error?: "oauth";
};

export function LoginPanel({ nextPath, reason: _reason, error }: LoginPanelProps) {
  const t = useTranslations("auth");
  const [isPending, setIsPending] = useState(false);
  const [hasProviderError, setHasProviderError] = useState(false);
  const hasError = error === "oauth" || hasProviderError;

  async function signIn() {
    if (isPending) return;

    setIsPending(true);
    setHasProviderError(false);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const result = await createBrowserSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        scopes: "openid email profile",
      },
    }).catch(() => ({ error: true }));

    if (result.error) {
      setHasProviderError(true);
      setIsPending(false);
    }
  }

  return (
    <main className="editorial-page login-shell">
      <section className="editorial-card login-card" aria-labelledby="login-title">
        <h1 id="login-title">{t("loginTitle")}</h1>
        <p>{t("loginDescription")}</p>
        {hasError ? <p className="login-error" role="alert">{t("oauthError")}</p> : null}
        <button
          className="button-primary login-google-button"
          type="button"
          onClick={signIn}
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? t("loading") : t("googleButton")}
        </button>
        <p className="login-privacy">{t("privacy")}</p>
      </section>
    </main>
  );
}

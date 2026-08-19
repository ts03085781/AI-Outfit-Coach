"use client";
/* eslint-disable @next/next/no-img-element -- authenticated provider avatar URLs are runtime values */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { BasicUser } from "@/lib/auth/user";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function httpsUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function basicUserOrNull(value: unknown): BasicUser | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  const id = textOrNull(candidate.id);
  if (!id) return null;

  return {
    id,
    name: textOrNull(candidate.name),
    email: textOrNull(candidate.email),
    avatarUrl: httpsUrlOrNull(candidate.avatarUrl),
  };
}

function avatarInitials(name: string | null): string {
  return name ? name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() : "?";
}

export function AccountSection() {
  const t = useTranslations("settings");
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [user, setUser] = useState<BasicUser | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { signal: controller.signal });
        const data: unknown = response.ok ? await response.json() : null;
        const session = data && typeof data === "object" ? data as { user?: unknown } : null;

        if (!controller.signal.aborted) setUser(basicUserOrNull(session?.user));
      } catch {
        if (!controller.signal.aborted) setUser(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadSession();
    return () => controller.abort();
  }, []);

  async function signOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setSignOutFailed(false);
    const result = await createBrowserSupabaseClient().auth.signOut().catch(() => ({ error: true }));

    if (result.error) {
      setSignOutFailed(true);
    } else {
      setUser(null);
    }

    setIsSigningOut(false);
  }

  const showAvatar = Boolean(user?.avatarUrl) && !avatarFailed;

  return <section className="account-card" aria-labelledby="account-title">
    <h2 id="account-title">{t("accountTitle")}</h2>
    {isLoading ? <p className="account-loading">{t("accountLoading")}</p> : null}
    {!isLoading && !user ? <div className="account-signed-out">
      <p>{t("signedOut")}</p>
      <a className="account-action" href="/login?next=/settings">{t("signIn")}</a>
    </div> : null}
    {!isLoading && user ? <div className="account-signed-in">
      {showAvatar ? <img className="account-avatar" src={user.avatarUrl ?? undefined} alt={t("avatarAlt", { name: user.name ?? "?" })} onError={() => setAvatarFailed(true)} /> : <span className="account-avatar account-avatar-placeholder" aria-hidden="true">{avatarInitials(user.name)}</span>}
      <dl className="account-metadata">
        <div><dt>{t("name")}</dt><dd>{user.name ?? "—"}</dd></div>
        <div><dt>{t("email")}</dt><dd>{user.email ?? "—"}</dd></div>
      </dl>
      {signOutFailed ? <p className="account-error" role="alert">{t("signOutError")}</p> : null}
      <button className="account-action" type="button" onClick={signOut} disabled={isSigningOut} aria-busy={isSigningOut}>
        {isSigningOut ? t("signingOut") : t("signOut")}
      </button>
    </div> : null}
  </section>;
}

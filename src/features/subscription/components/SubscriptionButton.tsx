"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SubscriptionSummarySchema, type SubscriptionSummary } from "../domain";

export function SubscriptionButton({ nextPath, onSubscribed }: {
  nextPath: "/settings" | "/analyze";
  onSubscribed?: (summary: SubscriptionSummary) => void;
}) {
  const t = useTranslations("subscription");
  const mounted = useRef(true);
  const identityVersion = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const signedOut = () => { ++identityVersion.current; };
    window.addEventListener("auth:signed-out", signedOut);
    return () => {
      mounted.current = false;
      window.removeEventListener("auth:signed-out", signedOut);
    };
  }, []);
  const pending = useRef(false);
  const [isLoading, setIsLoading] = useState(false);

  async function subscribe() {
    if (pending.current) return;
    pending.current = true;
    setIsLoading(true);
    const currentIdentity = identityVersion.current;
    try {
      const response = await fetch("/api/subscription", { method: "POST", cache: "no-store" });
      if (!mounted.current || identityVersion.current !== currentIdentity) return;
      if (response.status === 401) {
        window.location.assign(`/login?next=${nextPath}&reason=auth`);
        return;
      }
      const data: unknown = await response.json();
      if (!mounted.current || identityVersion.current !== currentIdentity) return;
      if (!response.ok) {
        if (response.status === 503 && data && typeof data === "object" && "error" in data && data.error === "SUBSCRIPTION_MAINTENANCE") {
          window.alert(t("maintenance"));
          return;
        }
        throw new Error("Subscription unavailable");
      }
      const summary = SubscriptionSummarySchema.parse(data);
      if (!mounted.current || identityVersion.current !== currentIdentity) return;
      onSubscribed?.(summary);
      window.dispatchEvent(new Event("subscription-changed"));
    } catch {
      if (mounted.current && identityVersion.current === currentIdentity) window.alert(t("error"));
    } finally {
      pending.current = false;
      if (mounted.current) setIsLoading(false);
    }
  }

  return <button className="button-primary" type="button" onClick={subscribe} disabled={isLoading} aria-busy={isLoading}>
    {t(isLoading ? "loading" : "subscribe")}
  </button>;
}

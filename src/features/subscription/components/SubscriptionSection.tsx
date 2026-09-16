"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { SubscriptionSummarySchema, type SubscriptionSummary } from "../domain";
import { SubscriptionButton } from "./SubscriptionButton";

export function SubscriptionSection() {
  const t = useTranslations("subscription");
  const format = useFormatter();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setLoading(true);
    setError(false);
    async function load() {
      try {
        const response = await fetch("/api/subscription", { cache: "no-store", signal: controller.signal });
        if (response.status !== 401 && !response.ok) throw new Error("Subscription unavailable");
        const data = response.status === 401 ? null : SubscriptionSummarySchema.parse(await response.json());
        if (generation.current === current) setSummary(data);
      } catch {
        if (generation.current === current) setError(true);
      } finally {
        if (generation.current === current) setLoading(false);
      }
    }
    function signedOut() {
      ++generation.current;
      controller.abort();
      setSummary(null);
      setLoading(false);
      setError(false);
      setCanceling(false);
    }
    window.addEventListener("auth:signed-out", signedOut);
    void load();
    return () => {
      generation.current = current + 1;
      controller.abort();
      window.removeEventListener("auth:signed-out", signedOut);
    };
  }, [revision]);

  async function cancel() {
    if (pending.current || !window.confirm(t("cancelConfirm"))) return;
    pending.current = true;
    setCanceling(true);
    const current = generation.current;
    try {
      const response = await fetch("/api/subscription/cancel", { method: "POST", cache: "no-store" });
      if (current !== generation.current) return;
      if (response.status === 401) {
        setSummary(null);
        window.location.assign("/login?next=/settings&reason=auth");
        return;
      }
      if (!response.ok) throw new Error("Cancellation unavailable");
      const data = SubscriptionSummarySchema.parse(await response.json());
      if (current === generation.current) {
        setSummary(data);
        window.dispatchEvent(new Event("subscription-changed"));
      }
    } catch {
      if (current === generation.current) window.alert(t("cancelError"));
    } finally {
      pending.current = false;
      if (current === generation.current) setCanceling(false);
    }
  }

  const end = summary?.currentPeriodEnd ? format.dateTime(new Date(summary.currentPeriodEnd), {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "";

  return <section className="editorial-card account-card subscription-card" aria-labelledby="subscription-title">
    <h2 id="subscription-title">{t("title")}</h2>
    <p className="subscription-price">{t("price")}</p>
    <p>{t("description")}</p>
    {loading ? <p role="status">{t("loading")}</p> : error ? <>
      <p role="alert">{t("error")}</p>
      <button className="button-secondary" type="button" onClick={() => setRevision((value) => value + 1)}>{t("retry")}</button>
    </> : summary?.isActive ? <>
      <p role="status">{t(summary.cancelAtPeriodEnd ? "canceledUntil" : "activeUntil", { date: end })}</p>
      {!summary.cancelAtPeriodEnd ? <button className="button-secondary" type="button" onClick={cancel} disabled={canceling} aria-busy={canceling}>
        {t(canceling ? "canceling" : "cancel")}
      </button> : null}
    </> : <>
      {summary && summary.status !== "none" ? <p role="status">{t(summary.status === "active" ? "expired" : summary.status)}</p> : null}
      <SubscriptionButton key={generation.current} nextPath="/settings" onSubscribed={setSummary} />
    </>}
  </section>;
}

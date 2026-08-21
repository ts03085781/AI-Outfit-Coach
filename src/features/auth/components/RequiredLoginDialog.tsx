"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

export function RequiredLoginDialog() {
  const t = useTranslations("auth");
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const loginLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    loginLinkRef.current?.focus();

    const hiddenSiblings = Array.from(document.body.children)
      .filter((element) => element !== dialogRef.current)
      .map((element) => ({ element, previousValue: element.getAttribute("aria-hidden") }));

    hiddenSiblings.forEach(({ element }) => element.setAttribute("aria-hidden", "true"));
    return () => {
      hiddenSiblings.forEach(({ element, previousValue }) => {
        if (previousValue === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", previousValue);
      });
    };
  }, []);

  const keepFocusOnLoginLink = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    loginLinkRef.current?.focus();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="required-login-layer" ref={dialogRef}>
      <div className="required-login-backdrop" aria-hidden="true" />
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="editorial-card required-login-dialog"
        onKeyDown={keepFocusOnLoginLink}
        role="alertdialog"
      >
        <h1 id={titleId}>{t("requiredTitle")}</h1>
        <p id={descriptionId}>{t("requiredDescription")}</p>
        <a className="button-primary required-login-action" href="/login?next=/analyze&reason=analysis" ref={loginLinkRef}>
          {t("goToLogin")}
        </a>
      </section>
    </div>,
    document.body,
  );
}

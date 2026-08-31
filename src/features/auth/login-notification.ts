import type { User } from "@supabase/supabase-js";

import type { RegistrationNotificationEmail } from "@/features/auth/registration-notification";
import { getVerifiedCurrentUser } from "@/lib/auth/user";
import { isSameOriginRequest } from "@/lib/abuse-guard";
import { getResendClient } from "@/lib/resend";

type LoginNotificationContent = {
  email: string;
  loginAt: Date;
};

type LoginNotificationEmail = LoginNotificationContent & {
  idempotencyKey: string;
};

type EmailSendResult = {
  error: unknown;
};

type LoginNotificationEmailClient = {
  emails: {
    send(
      message: {
        from: string;
        to: string;
        subject: string;
        html: string;
      },
      options: { idempotencyKey: string },
    ): Promise<EmailSendResult>;
  };
};

type LoginNotificationEmailDependencies = {
  client?: LoginNotificationEmailClient;
  from?: string;
};

type LoginNotifierDependencies = {
  getUser: () => Promise<User | null>;
  sendEmail: (input: LoginNotificationEmail) => Promise<void>;
  sendRegistrationEmail?: (input: RegistrationNotificationEmail) => Promise<void>;
  now: () => Date;
  logError: (message: string, error?: unknown) => void;
};

export type LoginNotificationResult =
  | "sent"
  | "unauthorized"
  | "email-unavailable"
  | "failed"
  | "verification-failed"
  | "login-not-recent";

const LOGIN_NOTIFICATION_WINDOW_MS = 5 * 60_000;
const LOGIN_CLOCK_SKEW_MS = 60_000;
const REGISTRATION_SIGN_IN_MATCH_WINDOW_MS = 60_000;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function renderLoginNotificationEmail({ email, loginAt }: LoginNotificationContent): string {
  const safeEmail = escapeHtml(email);
  const safeLoginAt = escapeHtml(formatUtc(loginAt));

  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AI Outfit Coach 登入通知</title>
  </head>
  <body style="margin:0;background:#f4f5f7;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">偵測到您的 AI Outfit Coach 帳號剛剛成功登入。</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 24px;color:#7c3aed;font-size:14px;font-weight:700;letter-spacing:.04em;">AI OUTFIT COACH</p>
                <h1 style="margin:0 0 20px;color:#111827;font-size:24px;line-height:1.35;">登入成功通知</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.75;">您好，</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.75;">偵測到您的帳號剛剛成功登入 AI Outfit Coach。</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f9fafb;border-radius:10px;">
                  <tr><td style="padding:16px 18px 8px;color:#6b7280;font-size:13px;">使用者 Email</td></tr>
                  <tr><td style="padding:0 18px 14px;color:#111827;font-size:15px;word-break:break-all;">${safeEmail}</td></tr>
                  <tr><td style="padding:0 18px 8px;color:#6b7280;font-size:13px;">登入時間</td></tr>
                  <tr><td style="padding:0 18px 16px;color:#111827;font-size:15px;">${safeLoginAt}</td></tr>
                </table>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">如果這次登入是您本人操作，您可以忽略此封郵件。</p>
                <p style="margin:0;font-size:15px;line-height:1.7;"><strong>如果您沒有進行這次登入，建議您立即檢查帳號安全性。</strong></p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#111827;color:#d1d5db;font-size:13px;">AI Outfit Coach</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendLoginNotificationEmail(
  input: LoginNotificationEmail,
  dependencies: LoginNotificationEmailDependencies = {},
): Promise<void> {
  const client = dependencies.client ?? getResendClient();
  const from = dependencies.from ?? process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) throw new Error("Missing RESEND_FROM_EMAIL configuration");

  const { error } = await client.emails.send(
    {
      from,
      to: input.email,
      subject: "AI Outfit Coach 登入通知",
      html: renderLoginNotificationEmail(input),
    },
    { idempotencyKey: input.idempotencyKey },
  );

  if (error) throw new Error("Resend rejected the login notification", { cause: error });
}

export function createAuthNotifier(dependencies: LoginNotifierDependencies) {
  return async function notifyLogin(): Promise<LoginNotificationResult> {
    let user: User | null;
    try {
      user = await dependencies.getUser();
    } catch (error) {
      dependencies.logError("Login notification user verification failed", error);
      return "verification-failed";
    }
    if (!user) return "unauthorized";
    if (!user.email) return "email-unavailable";

    try {
      const verifiedLoginAt = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null;
      const hasVerifiedLoginTime = verifiedLoginAt !== null
        && !Number.isNaN(verifiedLoginAt.getTime());
      if (!hasVerifiedLoginTime) return "login-not-recent";

      const nowMs = dependencies.now().getTime();
      const loginAgeMs = nowMs - verifiedLoginAt.getTime();
      if (loginAgeMs < -LOGIN_CLOCK_SKEW_MS || loginAgeMs > LOGIN_NOTIFICATION_WINDOW_MS) {
        return "login-not-recent";
      }

      const registeredAt = user.created_at ? new Date(user.created_at) : null;
      const registrationAgeMs = registeredAt === null
        ? Number.POSITIVE_INFINITY
        : nowMs - registeredAt.getTime();
      const registrationSignInDifferenceMs = registeredAt === null
        ? Number.POSITIVE_INFINITY
        : Math.abs(verifiedLoginAt.getTime() - registeredAt.getTime());
      const isRecentRegistration = registeredAt !== null
        && !Number.isNaN(registeredAt.getTime())
        && registrationAgeMs >= -LOGIN_CLOCK_SKEW_MS
        && registrationAgeMs <= LOGIN_NOTIFICATION_WINDOW_MS
        && registrationSignInDifferenceMs <= REGISTRATION_SIGN_IN_MATCH_WINDOW_MS;

      if (isRecentRegistration && dependencies.sendRegistrationEmail) {
        await dependencies.sendRegistrationEmail({
          email: user.email,
          registeredAt,
          idempotencyKey: `registration-notification/${user.id}/${registeredAt.toISOString()}`,
        });
        return "sent";
      }

      await dependencies.sendEmail({
        email: user.email,
        loginAt: verifiedLoginAt,
        idempotencyKey: `login-notification/${user.id}/${verifiedLoginAt.toISOString()}`,
      });
      return "sent";
    } catch (error) {
      dependencies.logError("Login notification email failed", error);
      return "failed";
    }
  };
}

export const createLoginNotifier = createAuthNotifier;

export const notifyCurrentLogin = createAuthNotifier({
  getUser: getVerifiedCurrentUser,
  sendEmail: sendLoginNotificationEmail,
  now: () => new Date(),
  logError: (message, error) => console.error(message, error),
});

export function createLoginNotificationHandler(
  notify: () => Promise<LoginNotificationResult>,
) {
  return async function POST(request: Request): Promise<Response> {
    if (!isSameOriginRequest(request)) {
      return Response.json(
        { error: "CROSS_SITE_REQUEST" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const result = await notify();
    const headers = { "Cache-Control": "private, no-store" };

    if (result === "unauthorized") {
      return Response.json({ error: "AUTH_REQUIRED" }, { status: 401, headers });
    }
    if (result === "email-unavailable") {
      return Response.json({ error: "EMAIL_UNAVAILABLE" }, { status: 422, headers });
    }
    if (result === "failed") {
      return Response.json({ error: "EMAIL_DELIVERY_FAILED" }, { status: 502, headers });
    }
    if (result === "verification-failed") {
      return Response.json({ error: "AUTH_UNAVAILABLE" }, { status: 503, headers });
    }
    if (result === "login-not-recent") {
      return Response.json({ error: "LOGIN_NOT_RECENT" }, { status: 409, headers });
    }

    return Response.json({ ok: true }, { headers });
  };
}

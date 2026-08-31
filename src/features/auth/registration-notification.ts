import { getResendClient } from "@/lib/resend";

type RegistrationNotificationContent = {
  email: string;
  registeredAt: Date;
};

export type RegistrationNotificationEmail = RegistrationNotificationContent & {
  idempotencyKey: string;
};

type EmailSendResult = {
  error: unknown;
};

type RegistrationNotificationEmailClient = {
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

type RegistrationNotificationEmailDependencies = {
  client?: RegistrationNotificationEmailClient;
  from?: string;
};

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

export function renderRegistrationNotificationEmail(
  { email, registeredAt }: RegistrationNotificationContent,
): string {
  const safeEmail = escapeHtml(email);
  const safeRegisteredAt = escapeHtml(formatUtc(registeredAt));

  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AI Outfit Coach 註冊成功</title>
  </head>
  <body style="margin:0;background:#f4f5f7;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">您的 AI Outfit Coach 帳號已成功註冊。</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 24px;color:#7c3aed;font-size:14px;font-weight:700;letter-spacing:.04em;">AI OUTFIT COACH</p>
                <h1 style="margin:0 0 20px;color:#111827;font-size:24px;line-height:1.35;">註冊成功</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.75;">您好，</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.75;">您的 AI Outfit Coach 帳號已成功註冊，歡迎開始探索專屬穿搭建議。</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f9fafb;border-radius:10px;">
                  <tr><td style="padding:16px 18px 8px;color:#6b7280;font-size:13px;">使用者 Email</td></tr>
                  <tr><td style="padding:0 18px 14px;color:#111827;font-size:15px;word-break:break-all;">${safeEmail}</td></tr>
                  <tr><td style="padding:0 18px 8px;color:#6b7280;font-size:13px;">註冊時間</td></tr>
                  <tr><td style="padding:0 18px 16px;color:#111827;font-size:15px;">${safeRegisteredAt}</td></tr>
                </table>
                <p style="margin:0;font-size:15px;line-height:1.7;">現在就可以回到 AI Outfit Coach，開始建立適合您的穿搭方向。</p>
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

export async function sendRegistrationNotificationEmail(
  input: RegistrationNotificationEmail,
  dependencies: RegistrationNotificationEmailDependencies = {},
): Promise<void> {
  const client = dependencies.client ?? getResendClient();
  const from = dependencies.from ?? process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) throw new Error("Missing RESEND_FROM_EMAIL configuration");

  const { error } = await client.emails.send(
    {
      from,
      to: input.email,
      subject: "AI Outfit Coach 註冊成功",
      html: renderRegistrationNotificationEmail(input),
    },
    { idempotencyKey: input.idempotencyKey },
  );

  if (error) {
    throw new Error("Resend rejected the registration notification", { cause: error });
  }
}

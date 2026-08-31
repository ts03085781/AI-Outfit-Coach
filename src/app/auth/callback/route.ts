import { after } from "next/server";

import {
  createAuthNotifier,
  sendLoginNotificationEmail,
} from "@/features/auth/login-notification";
import { sendRegistrationNotificationEmail } from "@/features/auth/registration-notification";
import { createAuthCallbackHandler } from "@/lib/auth/callback";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const notifyLogin = createAuthNotifier({
    getUser: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    sendEmail: async (input) => {
      after(async () => {
        await sendLoginNotificationEmail(input).catch((error) => {
          console.error("Login notification email failed", error);
        });
      });
    },
    sendRegistrationEmail: async (input) => {
      after(async () => {
        await sendRegistrationNotificationEmail(input).catch((error) => {
          console.error("Registration notification email failed", error);
        });
      });
    },
    now: () => new Date(),
    logError: (message, error) => console.error(message, error),
  });

  return createAuthCallbackHandler(
    (code) => supabase.auth.exchangeCodeForSession(code),
    notifyLogin,
  )(request);
}

import {
  createLoginNotificationHandler,
  notifyCurrentLogin,
} from "@/features/auth/login-notification";

export const POST = createLoginNotificationHandler(notifyCurrentLogin);

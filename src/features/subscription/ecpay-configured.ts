import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ecpayConfig } from "./ecpay";
import { createEcpaySubscriptionService } from "./ecpay-service";
import { createEcpayStore } from "./ecpay-store";

export function createConfiguredEcpayService(client = createAdminSupabaseClient()) {
  const config = ecpayConfig();
  return createEcpaySubscriptionService(config, createEcpayStore(client, config));
}

# Subscription backend (pre-payment milestone)

The unlimited plan costs NT$60 per calendar month. `subscriptions` stores the current entitlement, not payment history. Active and past-due rows grant access only while `current_period_start <= now < current_period_end`. Cancellation retains access through that end. No grace period or refund is provided. Existing daily usage is never reset by a subscription.

Migration `20260910051900_subscriptions.sql` was applied to the linked `ai-outfit-coach` cloud project on 2026-09-16 after local database tests passed. For other environments, apply the migration before deploying the app. Missing schema or unavailable Supabase fails closed with `SUBSCRIPTION_UNAVAILABLE` on subscription endpoints and `QUOTA_UNAVAILABLE` during analysis.

GET `/api/subscription` returns the authenticated account's summary. POST `/api/subscription` initiates subscription; POST `/api/subscription/cancel` stops mock renewal at period end. Both writes return `SUBSCRIPTION_MAINTENANCE` without database writes until the payment integration is available, except explicitly enabled local mocks. All endpoints are private and non-cacheable. Request bodies cannot choose identity, price or dates.

For a local isolated Supabase project, set server-only `SUBSCRIPTION_MOCK_ENABLED=true` together with `NODE_ENV=development` (or the test runner's `test` environment). Any Vercel environment disables mocks; production always disables them. Use a local database, never production credentials for mock development. Activation opens one calendar month using Taiwan time and clamps month-end dates. Repeat activation retains the existing paid period and never undoes cancellation. There is no mock recurring billing scheduler; expired mocks can be activated again manually.

Only backend service-role RPC calls can write subscriptions. Authenticated database clients can read their own row via RLS. Both mutation RPCs serialize operations per user. Provider-backed records cannot be canceled or overwritten by mock APIs. `ended_at` is reserved for provider lifecycle events; access expiry is computed from dates even if no scheduler updates stored status.

Before enabling real payments, add ECPay checkout, validated/idempotent payment callbacks, payment/event history and actual provider cancellation. Use the provider's confirmed calendar-month period boundaries, not mock date arithmetic. Never enable entitlement from a checkout click or report cancellation before provider cancellation succeeds. No payment event ingestion is included here, so payment/cancellation reconciliation remains part of that integration.

Local verification: `pnpm exec supabase test db --local supabase/tests/database/subscriptions.test.sql` and `node scripts/verify-subscription-concurrency.mjs` after applying the migration to an isolated local stack.


## Verification status (2026-09-10)
581 unit/component/evaluation tests, TypeScript, ESLint and production build passed. All 41 browser scenarios passed across the full run and two targeted timeout retries. The subscription migration was applied successfully to the local Docker database only. Database pgTAP and concurrency checks remain unverified because Docker subsequently stopped responding to health checks; rerun the local commands above after Docker recovers. Do not deploy the application before applying the migration to its target database.


## Database verification and cloud synchronization (2026-09-16)
- Recovered the unresponsive local Docker engine without removing containers or volumes.
- All three local pgTAP suites passed: 110 assertions, including 32 subscription assertions for RLS, client write denial, month-end/leap-year boundaries, cancellation and reactivation.
- Real concurrent activation/cancellation checks passed; duplicate activation did not extend the period, and activation did not undo cancellation.
- Cloud dry run listed only `20260910051900_subscriptions.sql`. Applied it with `--skip-vault`; no seed data, custom roles or unrelated migrations were pushed.
- Cloud migration history now matches the local version. Verified RLS/ownership policy, denied client mutation permissions, and service-role query access.
- Application-configured REST RPC `get_subscription` returned HTTP 200 for a nonexistent test identity (empty result), resolving the previous PGRST202 error.
- Security advisors reported no new findings from subscriptions; existing unrelated notices are unchanged.
- Confirmed the previous timed-out disposable local test identity is absent. No cloud test subscriptions were created and no real payments were enabled.

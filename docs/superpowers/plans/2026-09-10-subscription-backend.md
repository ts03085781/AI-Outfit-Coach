# Subscription backend implementation plan

> Agentic workers: use subagent-driven-development; user has approved implementation and parallel delegation.

Goal: Persist monthly NT$60 subscriptions, expose protected subscription APIs, and bypass daily free quota only for an active paid/test entitlement.
Architecture: subscriptions table and server-only service are authoritative. UI reads subscription summary; analyze checks entitlement once before reserving quota. Production initiation remains maintenance until ECPay is integrated.
Tech stack: Next.js 15, strict TypeScript, Supabase Postgres, Vitest, Playwright.
Spec: approved conversation decisions, recorded below.

## Constraints and decisions
- Calendar-month billing, NT$60. Cancellation stops renewal, access lasts until period end. No refund or grace period.
- No actual ECPay checkout, cancellation, or payment callbacks in this milestone. Never enable real subscriptions by clicking a button.
- Mock activation allowed only explicit test mode, never NODE_ENV=production or VERCEL_ENV=production. No browser-chosen user, price, dates or entitlement.
- Production/provider-backed cancellation must not pretend provider renewal was stopped if no provider adapter exists.
- RLS denies client subscription writes; backend derives identity from auth.
- Preserve existing daily free usage, safety and abuse guard. Query errors fail closed; entitlement at analysis start lasts through that analysis.
- Work in current user workspace to preserve prior approved uncommitted frontend work; do not commit, push or deploy.

## Shared interface
Subscription service get(userId) returns SubscriptionSummary: {status: "none"|"pending"|"active"|"past_due"|"expired", isActive: boolean, currentPeriodStart: string|null, currentPeriodEnd: string|null, cancelAtPeriodEnd: boolean, cancelRequestedAt: string|null, amountTwd: 60, billingInterval: "month"}. Export SubscriptionSummarySchema from features/subscription/domain.ts and configuredSubscriptionService from service.ts. get errors throw SubscriptionUnavailableError from domain.ts.
GET /api/subscription returns summary directly. POST /api/subscription returns summary in mock mode or 503 {error:"SUBSCRIPTION_MAINTENANCE"}; cancel POST /api/subscription/cancel returns summary. 401 unauthorized; 503 SUBSCRIPTION_UNAVAILABLE on DB failure. Response cache no-store.
Analysis quota response retains existing daily shape for free users; subscribed response is {type:"subscription", unlimited:true, currentPeriodEnd:string}. Analysis success quota uses same union.

## Tasks
- [x] Backend agent: subscription migration, RLS/RPC, domain/service/routes, focused domain/API and database tests, environment documentation. Monthly test periods clamp to month end. Atomic idempotent activation/cancel.
- [x] Frontend agent: shared subscription controls, settings statuses/cancel confirmation and multilingual strings; unit/browser tests. Shared API shape above, active account refresh after signout.
- [x] Root: analysis entitlement union, API and hook/page integration, tests for active bypass, expired fallback, DB error, unchanged free reservation lifecycle.
- [x] Review: agent initial review found no blockers; root completed final integration review (agent usage limit interrupted final report). Added production mock isolation and stale quota-response regression.
- [x] Root: unit tests, typecheck, lint, browser flows, database checks if local runtime available, production build. Record unavailable prerequisites honestly.


## Verification record
- 581 unit/component/evaluation tests pass; typecheck and lint pass.
- 41 browser scenarios validated in isolated checkout: 39 passed first run, two resource-contention timeouts passed on focused rerun.
- Production Next.js build and middleware build verification pass in isolated checkout with Node 24 and existing dependencies.
- Subscription migration applied successfully to local Docker database only; no remote migration or deployment.
- pgTAP/concurrency execution incomplete: Docker stopped answering even bounded `docker version` and `pg_isready` probes after migration. Stopped waiting CLI. Do not claim database tests passed.
- Local test insertion attempt ID 9eda35f5-63c1-4c74-8fc2-a22a79f0d615 timed out; when Docker recovers, check/remove that disposable auth.users row before rerunning concurrency validation.


## Completed follow-up (2026-09-16)
Docker recovered. All 110 pgTAP assertions and real concurrent activation/cancellation checks passed. Previous disposable test identity is absent. Applied only the subscription migration to verified cloud project slvinuyhidfzihercold using the linked CLI (Vault updates disabled); confirmed migration history, RLS/privileges and successful application REST RPC. Earlier database-verification and remote-deployment blockers are resolved. This sync does not deploy the application or enable ECPay payments.

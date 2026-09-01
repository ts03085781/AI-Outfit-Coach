# Daily Analysis Quota Design

## Summary

Add a server-enforced allowance of three successful outfit analyses per authenticated user per Taiwan calendar day. When a user has completed all three analyses, entering the analysis page shows a blocking dialog with the message “今日分析次數已達 3 次上限，請訂閱或等待刷新” and a note that the allowance resets at 00:00 Taiwan time. This phase does not implement subscriptions, checkout, billing webhooks, paid plans, or a subscription button.

Only an OpenAI response that becomes a valid, deliverable outfit analysis consumes an allowance. Invalid input, photo-precheck rejection, `RETAKE_REQUIRED`, provider failure, timeout, safety rejection, quota-service failure, and any response rejected by existing output validation do not consume an allowance.

## Goals

- Limit each authenticated user to three successful analyses per Taiwan calendar day.
- Enforce the limit on the server and atomically across tabs and application instances.
- Count only analysis results that pass the existing schema and fail-closed safety validation.
- Block the analysis page when all three successful analyses have been consumed.
- Reset availability at Taiwan time 00:00 without a reset job.
- Preserve the existing authentication, privacy, abuse-guard, image-validation, and output-safety boundaries.

## Non-goals

- Paid subscriptions, checkout, plan management, billing webhooks, refunds, or subscriber exemptions.
- A functional subscription call to action or placeholder subscription destination.
- Storing uploaded photos, generated analysis content, or analysis history.
- Applying the daily allowance to photo prechecks or follow-up questions.
- Replacing the existing in-memory abuse guard; the daily allowance is a product quota, not a burst-rate limiter.
- Displaying a persistent remaining-allowance counter in the analysis flow.

## Time and Allowance Semantics

The business timezone is the IANA timezone `Asia/Taipei`, currently UTC+8 with no daylight-saving transitions. PostgreSQL derives the allowance date from database time using `Asia/Taipei`; the browser never supplies or controls the date.

A Taiwan day runs from local `00:00:00` through the instant before the next local `00:00:00`. The quota response includes the next Taiwan midnight as an ISO 8601 UTC timestamp named `resetAt`. No scheduled reset or row mutation is required at midnight because each usage record is keyed by its Taiwan `usage_date`.

An analysis belongs to the Taiwan date on which its slot was reserved. If a request reserves a slot before midnight and completes after midnight, it counts against the earlier date while the new day's three slots remain available.

The fixed first-phase limit is `3`. It is a server constant and database-function constant rather than a client-provided parameter.

## Why Reservations Are Required

Counting only after OpenAI succeeds allows concurrent requests to pass a naive preflight check and exceed the hard limit. Counting before OpenAI and refunding failures can permanently charge a user if the server terminates before the refund. The selected design therefore uses expiring reservations:

1. Validate the authenticated request and image.
2. Atomically reserve one of the three daily slots.
3. Call OpenAI.
4. Convert the reservation to a completed use only after a valid analysis exists.
5. Release the reservation for every non-counting outcome.

Reservations expire after two minutes. This is longer than the current 30-second analysis timeout and leaves time for response validation and quota finalization. Expired reservations are ignored by status queries and removed opportunistically by reservation operations, so a terminated process cannot block a user permanently.

## Supabase Data Model

Create `public.daily_analysis_usage` with these columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `usage_date date not null`
- `status text not null` constrained to `reserved | completed`
- `expires_at timestamptz not null`
- `completed_at timestamptz null`
- `created_at timestamptz not null default now()`

Add consistency checks so `completed_at` is null for `reserved` rows and non-null for `completed` rows. Add an index on `(user_id, usage_date, status, expires_at)` for quota lookup and cleanup. Failed and released reservations are deleted; completed rows contain count metadata only and never contain photos, prompts, model output, location, device identifiers, or email addresses.

Enable RLS on the table as defense in depth. Revoke direct table privileges from `anon` and `authenticated`; neither browser role needs to query or mutate quota rows. Grant only the table privileges required by the database functions to `service_role`.

## Database Functions and Concurrency

Create these SQL functions in the exposed database schema so the server-side Supabase client can call them through RPC:

- `get_daily_analysis_quota(p_user_id uuid)` returns `limit`, `used`, `reserved`, `remaining`, `available_now`, and `reset_at`.
- `reserve_daily_analysis(p_user_id uuid, p_reservation_id uuid)` returns the allowed reservation ID and current quota summary, or a typed reason when no slot can be allocated.
- `complete_daily_analysis(p_user_id uuid, p_reservation_id uuid)` converts one live reservation owned by that user into a completed use and returns the updated summary.
- `release_daily_analysis(p_user_id uuid, p_reservation_id uuid)` deletes one still-reserved row owned by that user.

All functions use the default `SECURITY INVOKER` behavior, fully qualify relation names, and are executable only by `service_role`. Explicitly revoke function execution from `PUBLIC`, `anon`, and `authenticated`, then grant it to `service_role`. They must not be `SECURITY DEFINER`.

The application supplies `p_user_id` only from the verified Supabase Auth user, never from request input. The server generates `p_reservation_id` with `crypto.randomUUID()` before calling the RPC and reuses that ID if the RPC must be retried after an uncertain transport failure. The reserve function returns the existing matching reservation rather than allocating another slot, making reservation retries idempotent. The server-only client authenticates with `SUPABASE_SECRET_KEY`; that key must never use a `NEXT_PUBLIC_` name or enter client bundles.

Reservation and completion operations take the same transaction-level advisory lock derived from `user_id` and `usage_date`. Within the lock, they remove expired reservations for that user and day and recalculate the counts. A reservation is allowed only when:

```text
completed count + unexpired reservation count < 3
```

Completion succeeds only for a matching, unexpired `reserved` row and only while the completed count remains below three. Repeating completion for the same reservation returns its already-completed state without incrementing again. Repeating release for an already-released reservation is also a successful no-op. These idempotency rules let the server retry the same operation after an uncertain response without allocating or counting twice. Together with the lock, they make concurrent tabs unable to create a fourth completed result.

`used` counts completed rows. `reserved` counts unexpired in-flight rows. `remaining` is `max(0, 3 - used)` and describes how many successful results remain in the day. `available_now` is `max(0, 3 - used - reserved)` and describes how many requests can begin immediately.

If `used = 3`, reservation returns `daily_limit_reached`. If `used < 3` but `available_now = 0`, all remaining capacity is temporarily reserved by other requests; reservation returns `slots_busy`. The latter is not presented as a completed daily limit and can be retried after the in-flight requests finish or expire.

## Server Integration

Add a server-only quota client that owns the secret-key Supabase client and maps RPC responses into strict TypeScript domain types. It exposes four application operations corresponding to the database functions. Invalid RPC data and Supabase errors become a generic quota-unavailable error; database details are logged without user content and are not returned to the browser.

The existing authenticated route wrapper must make the verified `User` available to the wrapped handler. Existing authenticated routes that do not use the user object may ignore the additional argument; authentication behavior remains unchanged.

### `GET /api/analysis-quota`

This authenticated endpoint returns:

```json
{
  "limit": 3,
  "used": 2,
  "remaining": 1,
  "resetAt": "2026-09-01T16:00:00.000Z"
}
```

It does not expose reservation IDs or raw database errors. HTTP behavior is:

- `200` for a valid quota summary.
- `401 { "error": "AUTH_REQUIRED" }` for an unauthenticated request.
- `503 { "error": "QUOTA_UNAVAILABLE" }` when quota cannot be verified.

`remaining` in this public response is based on completed uses. Active reservations are internal concurrency state and do not trigger the reached-limit dialog.

### `POST /api/analyze`

The existing authentication, same-origin abuse guard, body-size checks, multipart parsing, image decoding, and request-schema validation run before reserving a slot. Invalid requests therefore never occupy quota capacity.

After validation and immediately before calling the analyzer, reserve a slot using the verified user ID:

- `daily_limit_reached` returns HTTP `429` with `DAILY_ANALYSIS_LIMIT_REACHED`, `limit`, `used`, `remaining`, and `resetAt`. The analyzer is not called.
- `slots_busy` returns HTTP `409 { "error": "ANALYSIS_SLOTS_BUSY" }`. The analyzer is not called, and the existing error UI tells the user that another analysis is in progress and to retry shortly.
- A quota RPC failure returns HTTP `503 { "error": "QUOTA_UNAVAILABLE" }`. The analyzer is not called.

Once reserved, the handler releases the reservation on `RETAKE_REQUIRED`, provider error, timeout, provider safety rejection, invalid provider output, thrown exceptions, and every other non-deliverable path. Release is best-effort because the two-minute expiry is the final recovery mechanism.

For a valid analysis, the handler completes the reservation before issuing the analysis token or returning the result. If completion fails, it does not deliver the result and returns `503 QUOTA_UNAVAILABLE`; it also attempts a best-effort release. This fail-closed behavior prevents a successful uncounted result.

The quota service may retry reserve, complete, or release once after a transport-level failure, always with the same reservation ID. It does not retry authorization, validation, or typed quota-denial responses. Because completion is idempotent, a committed completion whose first response was lost can be confirmed safely without consuming another use.

A successful response retains the existing `analysis` and `analysisToken` fields and adds:

```json
{
  "quota": {
    "limit": 3,
    "used": 1,
    "remaining": 2,
    "resetAt": "2026-09-01T16:00:00.000Z"
  }
}
```

The analysis route remains responsible for deleting in-memory image references in `finally`. No photo or model output is sent to Supabase.

## Analysis Page Access State

Replace the analysis page's separate session-summary request with the authenticated quota endpoint, because the quota endpoint establishes both facts required by this page. Model access as:

- `checking`: quota and authentication are unresolved; mark the page busy and make flow content inert.
- `ready`: authenticated and `used < 3`; enable the existing flow.
- `anonymous`: quota endpoint returned 401; show the existing `RequiredLoginDialog`.
- `limited`: quota endpoint returned a valid summary with `used = 3`; show the blocking daily-limit dialog.
- `unavailable`: quota verification failed; show a blocking retry dialog.

The client must still handle server enforcement. If `POST /api/analyze` returns `DAILY_ANALYSIS_LIMIT_REACHED`, transition immediately to `limited`, even if the entry check previously returned capacity. If it returns `ANALYSIS_SLOTS_BUSY`, keep the current photo and consent state, return to a retryable error state, and do not show the daily-limit dialog. If it returns `QUOTA_UNAVAILABLE`, show the blocking unavailable dialog because further analysis cannot be safely authorized.

When the third successful analysis returns, keep its result screen available, including follow-up questions, because follow-ups do not consume daily allowance. The response quota metadata records that no analyses remain. If the user then chooses a result action that would start a new analysis—retake, reselect photo, or restart—the page transitions to `limited` instead of discarding the result and beginning another flow. Navigating away and entering `/analyze` again reaches the same state through the quota status request.

## Dialog Behavior and Copy

Create a focused `DailyAnalysisLimitDialog` rather than embedding quota behavior into the login dialog. It uses `role="dialog"`, `aria-modal="true"`, an accessible title and description, and moves initial focus to its only action. While displayed, the analysis content is inert. The dialog cannot be dismissed back into the disabled analysis flow.

For `zh-TW`, the reached-limit dialog contains:

- Title: `今日分析次數已用完`
- Message: `今日分析次數已達 3 次上限，請訂閱或等待刷新`
- Reset note: `每日次數將於台灣時間 00:00 重置。`
- Action: `返回首頁`

The action navigates to `/`. There is no subscription button or non-functional destination in this phase. Equivalent copy is added for `en`, `ja`, and `ko`.

The quota-unavailable dialog says that today's allowance cannot currently be confirmed and provides `重新嘗試` and `返回首頁`. Retry repeats `GET /api/analysis-quota`; controls remain blocked until it succeeds. The existing login dialog takes precedence for a 401 response.

## Error Contract and Telemetry

Add these stable client-visible error codes:

- `DAILY_ANALYSIS_LIMIT_REACHED`
- `ANALYSIS_SLOTS_BUSY`
- `QUOTA_UNAVAILABLE`

They contain no provider, database, user, or reservation identifiers. Existing OpenAI and abuse-rate-limit codes retain their current meanings. Daily quota rejection is separate from the existing burst/sustained `RATE_LIMITED` response.

Telemetry may record only the coarse events `analysis_quota_reached`, `analysis_quota_busy`, and `analysis_quota_unavailable`. It must not include user IDs, exact usage counts, reset timestamps, reservation IDs, photos, analysis text, or Supabase error messages.

## Testing

### Database tests

- Verify `anon` and `authenticated` cannot select, insert, update, or delete quota rows.
- Verify those roles cannot execute quota functions and `service_role` can.
- Verify Taiwan date and next-midnight conversion at both sides of UTC 16:00.
- Verify three completed uses block a fourth reservation.
- Verify concurrent or repeated reservations cannot allocate more than three live slots and that retrying the same client-generated reservation ID does not allocate twice.
- Verify expired reservations do not consume capacity and are cleaned on the next reservation.
- Verify completion is ownership-scoped, requires a live reservation, returns idempotent success after completion, and cannot create a fourth completed use.
- Verify released, failed, or expired reservations do not increase `used`.
- Verify deleting an Auth user cascades their quota metadata.

### Unit and route tests

- Test strict RPC response parsing and mapping of Supabase failures to quota-unavailable.
- Test unauthenticated quota status, valid status, and unavailable status.
- Test that malformed input and invalid images never reserve quota.
- Test that daily-limit, slots-busy, and quota-unavailable outcomes never call the analyzer.
- Test reservation release for `RETAKE_REQUIRED`, every existing analyzer error class, aborts, and unexpected exceptions.
- Test successful analysis completion before response delivery and returned quota metadata.
- Test completion failure returns `QUOTA_UNAVAILABLE` without delivering analysis.
- Preserve every existing abuse-guard, image-safety, prompt-safety, output-safety, and token assertion.

### Component and browser tests

- Test entry states for ready, anonymous, completed daily limit, and quota unavailable.
- Test that the limit dialog is modal, focuses its action, makes the background inert, has no close or subscription button, and returns home.
- Test unavailable retry success and unavailable-to-401 transition.
- Test a limit response received during analysis opens the same blocking dialog.
- Test the third successful result remains readable and supports follow-up, while retake, reselect, and restart open the limit dialog.
- Test slots-busy preserves the selected photo and offers the existing retry path.
- In Playwright, mock quota and analysis endpoints deterministically; never contact Supabase or OpenAI.
- Verify the reached-limit browser flow sends no analysis request.

## Documentation and Configuration

Add `SUPABASE_SECRET_KEY` to `.env.example` with an explicit server-only warning. Update the README setup, request flow, privacy notes, and production checklist to describe the database-backed quota, Taiwan reset boundary, reservation recovery, and the rule that only a valid delivered analysis consumes allowance.

The Supabase migration must be generated with the installed CLI's `supabase migration new` command rather than a hand-authored timestamp. Before committing the schema change, run database policy tests and Supabase database advisors, then verify the local migration list.

## Verification

Run all of the following before claiming implementation completion:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm test:e2e
pnpm build
```

Also run the Supabase database test suite, database advisors, and local migration-list verification using commands discovered from the installed Supabase CLI `--help` output.

## Rollout and Failure Safety

Deploy the database migration and configure `SUPABASE_SECRET_KEY` before deploying application code. A missing secret or unavailable Supabase quota service fails closed: the application does not call OpenAI and shows the retryable quota-unavailable dialog. This avoids unmetered results and unexpected model spend.

Rollback of the application leaves the quota table unused but harmless. The schema should not be removed until the prior application version is confirmed stable. No backfill is needed; a user's first reservation creates their current-day metadata.

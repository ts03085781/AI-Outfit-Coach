# Monthly subscriptions and ECPay sandbox

The plan costs NT$60 per calendar month. Cancellation stops future charges and keeps paid access until the current period ends. It does not refund payments. Access has no grace period; expiry restores the existing free daily quota without resetting usage.

## Implemented flow

- `GET /api/subscription` returns the authenticated user's private, non-cacheable summary. Optional `canCancel` and `canCheckout` distinguish paid access from a still-running billing agreement (for example a failed renewal).
- `POST /api/subscription` returns either the existing summary or `{ checkout: { action, fields } }`. The browser submits a form to the fixed ECPay **stage** checkout endpoint. User identity, NT$60 price, monthly interval and 999-payment maximum are chosen by the server. Repeated/concurrent attempts reuse the same pending order; an ongoing agreement cannot create a second one.
- `POST /api/ecpay/payment` receives first-payment notifications; `/api/ecpay/period` receives renewals. Both accept bounded form bodies without user cookies, verify the SHA256 CheckMacValue using a timing-safe comparison, and validate the merchant, local order and amount. Duplicate/case-colliding fields are rejected. Successful notifications trigger an authoritative ECPay query before granting rights. `SimulatePaid=1` dashboard notifications never grant access, even in stage.
- `POST /api/ecpay/return` only redirects the browser to Settings. Its body and URL parameters never grant rights. Settings polls pending payments for up to a minute and offers a manual refresh.
- `POST /api/subscription/cancel` calls the signed ECPay `CreditCardPeriodAction` with `Action=Cancel`. The response signature, merchant, order and success code must match before marking cancellation. If the response is lost or cancellation is retried, an authoritative query confirming termination can repair local state. Database failures never produce a false success response.
- ECPay termination is irreversible. Re-subscribing after paid access expires creates a new agreement. A failed renewal can still be canceled even after access expires.

## Data and reconciliation

Apply `20260922020227_ecpay_subscriptions.sql` before enabling ECPay. It adds a `provider_environment` marker, server-only `ecpay_orders` and `ecpay_payment_events`, and transactional service-role RPCs. RLS is enabled and browser roles have no access to orders/events or mutation functions. No card information, keys, signatures, full provider responses, photos or email addresses are persisted in the payment ledger.

A unique open order per user and per-user transaction locks serialize checkout/cancellation/callback races. Payment events are unique by order and authorization number. Snapshots merge immutable events; older responses cannot remove newer paid periods or undo cancellation. Historical orders cannot replace the current subscription pointer. Stage entitlements are ignored when the stage adapter is disabled.

The query API supplies authorization timestamps and execution status, but **does not supply the next payment date**. Paid periods are derived in Taiwan time from confirmed successful authorizations, using the first authorization's day and time as the monthly anchor and clamping month ends. No notification arrival time extends a subscription. Verify month-end scheduling against the merchant agreement before enabling live billing.

The first payment callback returns exact `1|OK` only after processing; invalid or unavailable processing returns HTTP 200 with `0|ERROR`. ECPay's periodic callback is sent only once, so callback delivery is not the only recovery mechanism:

- Reading subscription state attempts a provider query at most once per minute per order. A query failure retains only already confirmed rights.
- `GET /api/cron/subscriptions` requires `Authorization: Bearer <CRON_SECRET>` and reconciles up to 20 due orders, five at a time. The configured Vercel schedule is daily at 22:15 UTC. Preview deployments do not run Vercel Cron; invoke this protected endpoint manually during sandbox testing. Larger deployments need a suitably frequent scheduler and backlog monitoring before rollout.
- The cron response reports `checked` and `failed`; failures use HTTP 503. Application logs contain generic event names only. Failed attempts are retryable after one minute. Recently terminated orders are reconciled for seven days to capture charges already in flight.

## Sandbox configuration and safe setup

This milestone only supports **ECPAY_ENV=stage**. `production` is rejected. Keep `ECPAY_ENABLED=false` on the live site (`https://stylecue.website/`). Use a separate test deployment and test Supabase database; do not give sandbox access to live users.

Set these server environment variables in the test deployment or in an untracked local `.env.local`:

```dotenv
ECPAY_ENABLED=true
ECPAY_ENV=stage
ECPAY_MERCHANT_ID=<public AIO test MerchantID>
ECPAY_HASH_KEY=<public AIO test HashKey>
ECPAY_HASH_IV=<public AIO test HashIV>
ECPAY_PUBLIC_BASE_URL=https://<stable-test-host>
SUBSCRIPTION_MOCK_ENABLED=false
```

The public AIO test credentials and card are in `.ecpay-skill/AGENTS.md`, under 測試帳號. No live merchant credentials are needed. Do not paste secret values into chat, commit them, use `NEXT_PUBLIC_` names for them, or place them in screenshots. Configure the test database's Supabase URL, publishable key and server secret separately, plus `CRON_SECRET` for reconciliation. Test login must have its own permitted Supabase OAuth redirect URL.

`ECPAY_PUBLIC_BASE_URL` must be a stable public HTTPS origin without a path, credentials or nonstandard port. Localhost and IP addresses are rejected. A Vercel Preview URL can work only when ECPay can reach the three `/api/ecpay/*` paths without Vercel login/protection. An existing production URL or an old deployment does not contain the new callback handlers until the code is deployed. Do not use Vercel share links or put bypass secrets in payment fields.

The application has no public test deployment configured yet. The live website must not be used as evidence that sandbox callbacks work.

## Verification and sandbox acceptance

Automated checks:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm test:e2e
pnpm build
pnpm exec supabase test db --local
node scripts/verify-ecpay-concurrency.mjs
node --test tests/unit/ecpay-callback-proxy.node.mjs
ECPAY_LOCAL_DB_TEST=true pnpm exec vitest run tests/unit/ecpay-store.integration.test.ts
```

Database tests use only the local Supabase stack. The concurrency script creates a disposable identity and removes its events, orders and user after completion.

Local verification on 2026-09-22 passed: 613 unit/component tests (the opt-in database test was skipped in that run and passed separately), 43 browser tests, 150 database assertions, concurrent checkout/callback/cancellation checks, three callback-proxy tests, TypeScript, ESLint and the production build. The local Supabase security advisor reported no issues. These checks do not establish that an actual ECPay stage payment or cancellation has succeeded. The cloud database and production deployment have not been changed.

### Optional temporary callback endpoint

For local sandbox acceptance, `scripts/ecpay-callback-proxy.mjs` listens on `127.0.0.1:3041` and forwards only form POSTs to `/api/ecpay/payment` and `/api/ecpay/period` on a separately configured local app at `127.0.0.1:3040`. It strips cookies and authorization headers, limits bodies to 32 KB, and returns only payment acknowledgements. The return route and `/settings` redirect the test browser to the local app. Other routes return 404.

Any approved public tunnel must target **3041**, never the application port or database. Run the application with local Supabase, a disposable test identity and public ECPay stage credentials; do not load production service credentials into that test runtime. Set `ECPAY_PUBLIC_BASE_URL` to the temporary HTTPS origin before starting the test. Close the tunnel and local processes after canceling the test agreement and removing the disposable local data. This setup supports the browser on the same computer only.

Automatic approval review rejected exposing the full application through `localhost.run`. The narrower callback proxy has been implemented and tested, but opening it through that third-party service still awaits explicit user authorization. No public tunnel has been opened.

After configuring a publicly reachable isolated test deployment:

1. Log in with a test account; click Subscribe and confirm the ECPay page displays NT$60 monthly (999 payments maximum).
2. Complete payment with the official stage card. Verify the server callback, one payment event, active rights and Cancel subscription in Settings.
3. Return to Settings before a callback arrives; it must show pending and never trust `RtnCode` in a browser URL.
4. Cancel; verify the signed provider response, then query `ExecStatus=0`. Refresh Settings and confirm the original paid end date remains.
5. Repeat the callback and cancellation. Check no extra period or duplicate order is created. Invoke the protected reconciliation endpoint and verify it repairs a deliberately withheld callback.
6. Periodic renewals are tested automatically with deterministic provider fixtures. A monthly stage agreement does not demonstrate a real second charge during a short test session; record this limitation rather than claiming otherwise.

Official specifications fetched on 2026-09-22:

- [Recurring checkout](https://developers.ecpay.com.tw/2868.md)
- [Recurring payment notifications](https://developers.ecpay.com.tw/5631.md)
- [Recurring order query](https://developers.ecpay.com.tw/2892.md)
- [Cancel recurring billing](https://developers.ecpay.com.tw/2900.md)

## Existing local mock mode

`SUBSCRIPTION_MOCK_ENABLED=true` still works only in local development/test, never on Vercel or in production. Mock subscriptions cannot modify provider records. Keep mock mode disabled for ECPay testing. The original subscription migration was synchronized to the existing cloud project on 2026-09-16; the new ECPay migration must be applied separately to the chosen test environment.

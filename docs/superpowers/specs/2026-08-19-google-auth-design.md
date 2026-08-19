# Google Authentication Design

## Goal

Add Google sign-in to the public-facing product **AI StyleCue** with Supabase Auth. Visitors may browse the home page, settings page, and outfit flow without signing in. Authentication is required only when a visitor who has passed the photo precheck presses “Start analysis”.

The first version stores no outfit photos or analysis history. Supabase Auth remains the sole source of basic identity data (stable user ID, name, email, and avatar) so a later subscription system can attach plans and daily usage to the same user ID.

“AI Outfit Coach” remains the internal repository name and is not used as the product name in authentication UI.

## Selected architecture

Use Supabase Auth with Google OAuth, `@supabase/supabase-js`, and `@supabase/ssr`. The application uses Supabase's PKCE flow and cookie-based sessions so Server Components and route handlers can identify the same signed-in user as browser components.

Add separate Supabase client factories for browser and server contexts. A Next.js middleware refreshes expiring Supabase cookies but does not protect or redirect any page. Authorization is enforced at the operation boundary instead:

- `/`, `/analyze`, `/settings`, and `/login` remain public.
- `/api/photo-check` remains public because the existing flow performs the photo eligibility check immediately after photo selection, before “Start analysis”. Its existing rate limiting remains responsible for abuse control.
- `/api/analyze` requires a verified Supabase user and returns `401` when unauthenticated.
- `/api/follow-up` also requires a verified Supabase user because it operates on the result of an authenticated analysis.
- Telemetry remains independent of authentication in this phase.

Server API authorization is mandatory even though the client checks the session first. Client-side checks only drive the user experience and are not a security boundary.

## Sign-in flow

The login page lives at `/login`. It shows the AI StyleCue product name, a short product introduction, a Google sign-in button, and a concise privacy explanation that only basic Google profile information is requested. The requested scopes are limited to OpenID, email, and profile.

The Google button starts Supabase OAuth and sets its redirect target to `/auth/callback`. A validated, site-relative `next` parameter is carried through the flow and defaults to `/analyze`. The callback exchanges the one-time PKCE code for a Supabase session, then redirects to the validated destination. Absolute URLs, protocol-relative URLs, encoded external destinations, and other unsafe values are rejected to prevent open redirects.

Google OAuth uses a full-page redirect. No outfit image is written to local storage, IndexedDB, a database, or temporary server storage to survive that redirect. After successful sign-in, the user returns to `/analyze` with a success marker and is told to select the photo again.

OAuth cancellation, provider errors, missing codes, and code-exchange failures return to `/login` with a localized, retryable error. Error URLs never expose provider secrets or raw internal exception details.

## “Start analysis” authentication gate

The existing occasion selection, image preparation, local preview, and photo precheck continue unchanged for anonymous visitors. Once the photo has passed precheck, pressing “Start analysis” performs these steps:

1. Disable the action while checking the current Supabase user to prevent duplicate requests.
2. If a verified user exists, record the existing consent action and submit the analysis normally.
3. If no verified user exists, do not call `/api/analyze`; show a modal `alertdialog` explaining that AI StyleCue requires sign-in before analysis.
4. The dialog contains exactly one action, “Go to sign in”. It has no close button or secondary action and cannot be dismissed by its backdrop or Escape key. Focus moves into the dialog and remains on its only action while the dialog is open.
5. Pressing the action navigates to `/login?next=/analyze&reason=analysis`.

If the browser check succeeds but the server subsequently returns `401` because the session expired or was revoked, the flow leaves the analyzing state and opens the same required-login dialog instead of presenting a generic AI failure.

## Settings account section

The account interface is shown only on the public `/settings` page:

- Signed-out state: show that no account is connected and provide a link to `/login?next=/settings`.
- Signed-in state: show the Google-provided avatar when available, display name, and email, plus a sign-out button.
- After sign-out, remain on `/settings` and render the signed-out state.

No account information or sign-out control is added to the home page, analysis page, or bottom navigation. Images use safe fallback initials or a neutral placeholder when Google provides no usable avatar; the UI does not assume optional metadata is present.

## Data and future billing boundary

No `profiles`, plans, subscriptions, usage, photos, or analysis-history tables are introduced in this phase. Basic identity is read from Supabase's managed auth user. Application authorization must use the stable Supabase user ID, never the mutable email address.

A later billing phase can add application-owned subscription and daily-usage records keyed by that user ID, with Row Level Security and server-side quota enforcement. The proposed free/pro/max limits are explicitly out of scope for this change.

## Configuration and deployment

The application needs only the public Supabase project URL and publishable key:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The Google OAuth client secret is entered directly in the Supabase dashboard and is never placed in source control, browser code, or Vercel environment variables. A Supabase `service_role` or secret key is not needed.

OAuth redirect configuration supports `http://localhost:3000` for development and the exact production `*.vercel.app` origin. Preview deployment URLs are not supported in this phase. Browser-generated callback URLs use the current origin, while Supabase's Site URL and redirect allow list define which origins are accepted. `NEXT_PUBLIC_SITE_URL`, if retained for other deployment documentation, is not trusted as an authorization control.

## Localization and presentation

Add authentication and account copy to Traditional Chinese, English, Japanese, and Korean message files. The login page and dialog follow the existing mobile PWA visual system and use AI StyleCue consistently. Loading, error, keyboard-focus, and screen-reader states are included.

## Testing

Focused unit and component tests cover:

- authenticated “Start analysis” continuing to the existing API request;
- unauthenticated “Start analysis” opening the required-login dialog and not calling `/api/analyze`;
- the dialog's single action and non-dismissible behavior;
- an API `401` reopening the same login dialog;
- safe and unsafe `next` parameter handling;
- login error rendering and Google sign-in initiation;
- settings signed-in, signed-out, missing-metadata, and sign-out states;
- `/api/analyze` and `/api/follow-up` rejecting unauthenticated requests.

Playwright coverage verifies that public pages remain browseable, the anonymous analysis gate appears only after “Start analysis”, and the settings account states behave correctly with Supabase mocked. Tests do not automate a real Google account or require production OAuth credentials.

Verification includes `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:e2e`, and `pnpm build`.

## Out of scope

- Subscription checkout, plans, billing webhooks, and daily analysis quotas.
- A custom domain or authentication on Vercel preview deployments.
- Password, magic-link, passkey, or non-Google identity providers.
- Persisting photos, analysis results, or restoring an in-progress photo across OAuth.
- A public user profile table or profile-editing UI.

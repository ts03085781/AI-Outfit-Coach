# Photo Precheck Design

## Goal

Automatically run a fast, low-cost AI check after the browser prepares a selected photo. Enable the existing start-analysis action only when that photo meets all input requirements, reducing the disappointment of paying and waiting for a full analysis that ends in a retake request.

The precheck is a user-experience aid, not an API security boundary. The full analyzer remains independently responsible for rejecting insufficient photos.

## Product decisions

- Selecting a photo is explicit consent to upload it for the precheck.
- The privacy disclosure must distinguish the automatic precheck upload from the user-initiated full analysis. Its final UI placement is intentionally deferred.
- The precheck evaluates every current photo requirement, not only composition.
- A precheck outage, timeout, or rate limit fails closed in the UI. The user cannot start analysis until a check succeeds.
- The precheck uses the existing OpenAI account and Responses API through a separately configurable model.
- `OPENAI_PHOTO_CHECK_MODEL` configures the precheck model; the initial deployment value is `gpt-5-nano`.
- `OPENAI_VISION_MODEL` continues to configure the full outfit analyzer.
- The precheck timeout is 10 seconds. The full analysis timeout remains 30 seconds.
- No approval token is issued or required. `/api/analyze` remains callable independently and retains its existing retake behavior.

`gpt-5-nano` is selected because it supports image input and is positioned for fast, low-cost classification workloads in the [official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-5-nano).

## Eligibility contract

The precheck must determine whether the photo:

- contains exactly one person;
- shows a complete outfit, including upper clothing, lower clothing, and shoes;
- leaves the relevant clothing sufficiently unobstructed;
- is bright and sharp enough to inspect;
- is an outfit photo rather than unrelated content;
- does not contain inappropriate content; and
- allows the visible clothing to be identified reliably.

The model returns one primary, actionable failure reason. Natural-language model output is never rendered directly. The application validates a strict discriminated union and maps the stable reason code to localized UI copy:

```ts
type PhotoCheckResult =
  | { eligible: true; reason: null }
  | {
      eligible: false;
      reason:
        | "NO_PERSON"
        | "MULTIPLE_PEOPLE"
        | "INCOMPLETE_OUTFIT"
        | "OUTFIT_OBSTRUCTED"
        | "TOO_DARK"
        | "TOO_BLURRY"
        | "NOT_OUTFIT_PHOTO"
        | "INAPPROPRIATE_CONTENT"
        | "CLOTHING_UNRECOGNIZABLE";
    };
```

When more than one condition fails, the prompt tells the model to choose the first applicable category from this user-action priority:

1. inappropriate or unrelated content;
2. no person or multiple people;
3. incomplete or obstructed outfit;
4. insufficient lighting or sharpness;
5. clothing that still cannot be identified reliably.

## Architecture

### Precheck API

Add `POST /api/photo-check`. It accepts only the prepared image as multipart form data; occasion, weather, setting, desired feel, and locale are not needed for model classification.

The handler applies the same boundary protections as the analysis endpoint:

- same-origin, endpoint burst and sustained rate limits, and global concurrency control;
- a 6 MB multipart request limit;
- a 4 MB image limit;
- JPEG, PNG, and WebP MIME allowlisting;
- real image decoding before the provider call; and
- in-memory-only image handling with no image or provider-output logging.

The OpenAI adapter uses `OPENAI_PHOTO_CHECK_MODEL`, `store: false`, a low-detail image input, a short immutable classification prompt, and strict JSON Schema output. Invalid structured output may be retried once within the same overall 10-second deadline. Transport, authentication, refusal, and rate-limit failures are not retried automatically.

The endpoint returns:

- `200` with `{ eligible: true, reason: null }` for an acceptable photo;
- `200` with `{ eligible: false, reason }` for an ordinary photo rejection;
- `400` with `{ error: "INVALID_IMAGE" }` for an invalid multipart body, file, MIME type, size, or decoded image;
- `429` with `{ error: "RATE_LIMITED" }` when request limits reject the check;
- `503` with `{ error: "PHOTO_CHECK_UNAVAILABLE" }` for provider authorization, refusal, availability, or response-validation failures; and
- `504` with `{ error: "PHOTO_CHECK_TIMEOUT" }` when the 10-second deadline expires.

Provider details, request IDs, and raw output must not be returned to the browser. Diagnostic logs remain metadata-only.

### Client state

`useOutfitFlow` owns the precheck lifecycle for the currently prepared image:

```ts
type PhotoCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "passed" }
  | { status: "rejected"; reason: PhotoCheckReason }
  | { status: "error"; code: PhotoCheckErrorCode };
```

`PhotoStep` renders this state and never decides eligibility itself. The start-analysis button is visible after image preparation but disabled unless the current state is `passed`.

The current consent ref remains the final-analysis guard. Passing the precheck does not record consent to full analysis; clicking the enabled start-analysis button still records that intent immediately before calling `analyze()`.

## User and data flow

1. The user selects a supported image.
2. The browser runs the existing orientation, resizing, WebP conversion, and client-side validation.
3. Once preparation succeeds, the UI displays the local object-URL preview, resets prior consent and precheck state, and automatically posts the prepared blob to `/api/photo-check`.
4. While the request is active, the UI displays a localized checking message and a visible but disabled start-analysis button.
5. On acceptance, the UI displays a concise success state and enables the button.
6. On photo rejection, the preview remains visible, a single localized reason is shown, and the disabled button remains visible. The user can replace the photo.
7. On a technical error, timeout, or rate limit, the preview remains visible and the button stays disabled. The UI offers both retry-check and replace-photo actions.
8. A successful retry follows the same acceptance flow.
9. Only clicking the enabled start-analysis button submits the photo and context to `/api/analyze`.

Replacing the photo, returning to the occasion step, restarting the flow, or completing an analysis invalidates the current precheck state. A new photo can never inherit a previous photo's `passed` state.

Each precheck has an `AbortController` and monotonically increasing request identifier. Replacing the photo or leaving the step aborts the old request. If cancellation races with completion, only the response matching the current request identifier may update state. This applies equally to success, rejection, and error results.

## Privacy and data lifecycle

Selecting a photo now causes provider processing before the full-analysis button is pressed. Product copy must explicitly disclose both stages:

- selection uploads the prepared photo to the AI provider for an automatic specification check; and
- pressing start analysis sends the photo for the full outfit analysis.

The eventual disclosure position and final wording are outside this change, but the behavior must not ship with copy that falsely says selection is local-only.

The browser retains the prepared blob only for preview, retry, and potential full analysis. The precheck handler keeps image bytes only for the request lifetime and clears references in `finally`. It does not write images, model output, or filenames to files, object storage, databases, telemetry, or logs. OpenAI requests set `store: false`; any actual provider retention must continue to be described accurately in product copy.

## Error behavior

- Client preparation failure: do not call the precheck; show the existing image error and no analysis action.
- Photo rejected: treat it as a successful API interaction, show the mapped reason, and require replacement.
- Timeout, provider failure, invalid response, or refusal: show one localized temporary-check error and allow a manual retry.
- Rate limit: show localized rate-limit guidance and allow retry after the user chooses to try again.
- Stale response: ignore it without changing UI or emitting result telemetry.
- Precheck false positive: the full analyzer may still return the existing `422 RETAKE_REQUIRED` response.
- Precheck false negative: the user may replace the image; the MVP does not provide a bypass because the agreed UI behavior is fail-closed.

## Localization

Add matching Traditional Chinese, English, Japanese, and Korean messages for:

- checking progress;
- check passed;
- each `PhotoCheckReason`;
- temporary failure;
- timeout;
- rate limit;
- retry check; and
- the revised privacy disclosure describing precheck-on-selection.

Reason codes and API error codes remain language-neutral. Free-form provider text is not translated or displayed.

## Telemetry

Extend the strict first-party telemetry union with:

- `photo_check_pass` plus a coarse latency bucket;
- `photo_check_reject` plus a `PhotoCheckReason` and coarse latency bucket; and
- `photo_check_error` plus a stable technical error code and coarse latency bucket.

Telemetry does not contain the image, filename, original provider output, free text, IP address, or persistent identifier. A stale or intentionally aborted request emits no result event. Transport failure remains non-blocking.

The product outcome is assessed by comparing the rate of full-analysis `analysis_retake` events before and after precheck, alongside precheck rejection and error rates.

## Testing

### Unit and handler tests

- Parse both eligible branches and every stable rejection reason.
- Reject unknown fields, inconsistent eligible/reason combinations, malformed JSON, and refusal output.
- Map provider authorization, rate limit, unavailable, invalid-response, and timeout failures without leaking provider data.
- Enforce multipart, byte, MIME, and decoding limits before calling the model.
- Verify the one retry for invalid structured output stays within the single 10-second deadline.
- Verify `store: false`, the configured precheck model, low-detail image input, and no occasion or user context in the model prompt.
- Verify all new telemetry event unions and reject incompatible or unknown fields.

### Component and flow tests

- Selecting and preparing a photo automatically starts exactly one precheck.
- The preview is visible and start-analysis button disabled while checking.
- Passing enables the button but does not start full analysis.
- Each rejection reason renders localized fixed copy and keeps the button disabled.
- A technical failure exposes retry and replacement actions while remaining locked.
- Retry checks the same prepared blob and can transition to passed.
- Replacement clears a prior pass immediately.
- Returning, restarting, rapid reselection, and out-of-order responses cannot restore stale state.
- Clicking start analysis after a pass preserves the existing payload and consent guard.
- The full analyzer can still return `422 RETAKE_REQUIRED` independently.

### Browser acceptance

Mock-only Playwright coverage includes pass, rejection, technical retry, photo replacement, and no automatic analysis. Existing mobile-width and accessibility checks remain in place; checking and result status messages use appropriate live regions, and disabled controls expose their state to assistive technology.

### Verification commands

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm test:e2e
pnpm build
```

## Acceptance criteria

- Every newly prepared photo automatically enters precheck before full analysis is available.
- The start-analysis button cannot be activated unless the current photo has passed.
- Rejections explain exactly one actionable reason using trusted localized copy.
- Technical failures never silently allow full analysis and always offer a manual retry.
- Photo replacement and navigation invalidate old checks, including raced responses.
- Passing precheck never starts full analysis without the user's explicit button click.
- The formal analysis endpoint and its independent retake fallback continue to work without a precheck token.
- No image or free-form model content is persisted or emitted through telemetry or logs.
- Anonymous telemetry can measure pass, rejection, error, latency, and the downstream change in analysis-retake rate.

## Out of scope

- Treating precheck as an authorization or anti-abuse boundary.
- Issuing or verifying a photo approval token.
- Persisting or caching checked photos server-side.
- Automatically starting full analysis after a pass.
- Allowing users to bypass a failed or rejected precheck.
- Final visual placement of the revised privacy disclosure.
- Training a custom computer-vision classifier.

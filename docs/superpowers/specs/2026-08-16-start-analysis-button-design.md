# Start Analysis Button Design

## Goal

Replace the photo-consent checkbox with one explicit primary action labeled “開始分析”. Clicking the button records consent and immediately advances to the existing analysis step.

## Selected approach

Keep the consent state and fail-closed guard in `useOutfitFlow`. `PhotoStep` will render a button only after a prepared image is available. Its click handler will synchronously call `onConsentChange(true)` and then `onAnalyze()`, preserving the current guarantee that the image cannot be submitted unless consent has been recorded.

This is preferred over removing consent state or moving implicit consent into `analyze()`: both alternatives weaken the separation between user intent and image submission, while adding no user-visible benefit.

## User interface

- Before image preparation completes, render no analysis action.
- After image preparation completes, keep the local preview, replacement action, provider privacy notice, and local privacy notice.
- Replace the checkbox and its consent label with a full-width primary button labeled “開始分析”.
- Give the button a minimum 44px tap target and a visible keyboard focus style through the existing `primary-action` styling.
- Clicking the button means the user agrees to use the current photo for this analysis and starts analysis immediately.

## Component and data flow

- `PhotoStep` no longer consumes `consented`; it still consumes `onConsentChange` and `onAnalyze`.
- The button click handler calls `onConsentChange(true)` before `onAnalyze()`.
- `OutfitFlowPage` stops passing the now-unused `consented` rendering prop.
- `useOutfitFlow` remains the source of truth for consent. Its ref-based guard continues to prevent analysis if consent was not recorded, and photo replacement continues to reset consent.
- The API contract and analysis states do not change.

## Localization

Replace the obsolete `photo.consent` message with `photo.startAnalysis` in Traditional Chinese, English, Japanese, and Korean. The Traditional Chinese value is exactly “開始分析”.

## Error and privacy behavior

Existing image preparation errors, transient analysis errors, retry behavior, and retake behavior remain unchanged. Privacy disclosures stay visible before the user presses the button. No photo is sent by selection or replacement alone.

## Testing

- Unit tests verify that the action is absent before preparation and visible afterward.
- Unit tests verify that clicking “開始分析” transitions to analysis and preserves existing request payload behavior.
- Unit tests verify the primary action retains an accessible tap target and focus styling.
- Playwright flows use the button rather than the removed checkbox and verify replacement does not start analysis.
- Full verification runs unit tests, TypeScript checking, ESLint, Playwright, and the production build.

## Out of scope

- Changing privacy copy or provider retention policy.
- Changing API request structure, retries, result rendering, or photo preparation.
- Adding a separate confirmation modal or a second consent interaction.

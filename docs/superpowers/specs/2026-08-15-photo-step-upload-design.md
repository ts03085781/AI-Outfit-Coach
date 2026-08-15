# Photo Step Upload Design

## Goal

Simplify the second step of the outfit-analysis flow into one photo-selection surface. Before a photo is ready, the surface is a large upload placeholder. After a photo is ready, the surface becomes the preview with an overlaid replacement action. Consent is available only when a prepared photo exists.

## Scope

This change is limited to the photo-step UI, its localized copy, styling, and focused unit and browser tests. It does not change image preparation, analysis requests, privacy behavior, telemetry, or the API contract.

## Interaction Design

### No prepared photo

- Show a full-width, rounded, dashed upload surface based on the supplied reference image.
- Center a plus symbol, the primary label `加入一張全身照`, and the hint `JPG、PNG、WebP，單張照片` vertically within the surface.
- Make the entire surface a real button that opens the platform file picker.
- Support pointer, Enter, and Space activation through native button behavior.
- Do not render the consent checkbox.
- Do not render the former separate camera and photo-library controls.
- Continue showing an image-preparation error above the upload surface when one exists.

### Prepared photo available

- Show the existing local object-URL image preview.
- Place a `更換照片` button over the preview's top-right corner.
- Have the replacement button open the same platform file picker as the empty upload surface.
- Render the consent checkbox below the preview only after image preparation succeeds.
- Preserve the existing behavior where checking consent immediately starts analysis.

### Replacement and processing

- Use one hidden file input with `accept="image/jpeg,image/png,image/webp"` for both entry points.
- Do not set the `capture` attribute; both actions follow the former photo-library selection behavior.
- Read the selected file once and pass it to the existing `onChoosePhoto` callback.
- Reset the input value after selection so choosing the same file again still emits a change event.
- Preserve the flow hook's current fail-closed replacement behavior: choosing a replacement immediately clears the old prepared image, consent, and image error. While preparation is pending, show the empty upload state and keep consent hidden.
- If preparation fails, keep the empty upload state, keep consent hidden, and show the existing localized error.

## Component Design

`PhotoStep.tsx` will own a ref to the single hidden file input. A small internal handler will invoke the input from either visible button, and one change handler will forward the selected file and clear the input value.

The component will render one of two mutually exclusive visual states:

1. An empty upload button when no preview URL is available.
2. A positioned preview container containing the image and replacement button when a preview URL is available.

The consent label will be rendered only with the prepared-photo state. The existing `hasPhoto` prop is redundant with the prepared image/preview state and should be removed from `PhotoStepProps` and its caller unless implementation reveals a state distinction that requires it.

## Styling

- Replace the old `.photo-picker-options` and `.photo-picker` presentation with focused classes for the hidden input, empty upload surface, placeholder contents, preview container, and replacement button.
- Match the reference with a pale neutral background, muted blue-green dashed border and text, generous rounded corners, and centered content.
- Preserve the current preview height and `object-fit: contain` behavior unless responsive verification shows clipping or overflow.
- Give both visible controls at least a 44-by-44-pixel tap target.
- Add an obvious `:focus-visible` outline.
- Keep the replacement control legible over light and dark photos with an opaque or strongly translucent background.

## Localization

Add equivalent keys to `zh-TW`, `en`, `ja`, and `ko` message files for:

- Add a full-body photo.
- `JPG、PNG、WebP，單張照片` and its translations.
- Replace photo.

The Chinese copy is exact. Other locales should preserve the same meaning and explicitly list JPG, PNG, and WebP.

The obsolete camera and library keys may remain if used elsewhere; otherwise they can be removed only after a repository-wide usage check confirms they are unused.

## Accessibility

- The empty surface and replacement action are native buttons with localized accessible names.
- The file input remains programmatically available but visually hidden.
- The image retains its localized preview alternative text.
- The consent checkbox remains associated with its full consent copy and keeps its current minimum tap target.
- Decorative plus content is hidden from assistive technology when the button's accessible name already describes the action.

## Testing and Acceptance Criteria

Focused unit tests will verify that:

- The empty upload action is present before selection.
- The empty state exposes the JPG, PNG, and WebP hint.
- The consent checkbox and replacement action are absent before a prepared photo exists.
- The old separate camera and library controls are absent.
- The hidden input accepts JPEG, PNG, and WebP and has no `capture` attribute.
- Selecting a file through the shared input produces the local preview.
- A prepared photo shows both the replacement action and consent checkbox.
- Starting replacement hides the old preview and consent until preparation finishes.
- The same file can be selected again.
- Checking consent still immediately starts analysis.

Focused Playwright coverage will verify the mobile user flow from the empty upload surface through preview, replacement, consent, and successful mocked analysis. Existing test helpers that target `拍照` or `選擇照片` will be updated to target the new shared control.

Before completion, run:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:e2e`

## Non-goals

- Adding camera capture as a separate action.
- Adding drag-and-drop-specific behavior.
- Changing upload limits or image compression.
- Changing when or where image data is transmitted.
- Changing the immediate-analysis-on-consent interaction.

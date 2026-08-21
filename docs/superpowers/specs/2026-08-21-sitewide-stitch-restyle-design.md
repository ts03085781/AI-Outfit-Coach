# Sitewide Stitch Restyle Design

## Goal

Restyle every user-facing page in AI Outfit Coach so the product consistently follows the `DESIGN.md` system derived from Google Stitch project `4771117903189315119`. The finished application should feel like one monochrome, editorial, mobile-first fashion product while preserving all existing behavior, localization, privacy safeguards, and API contracts.

## Scope

The restyle covers:

- Home, including hero, weather, trend list, and bottom navigation.
- Analyze flow, including occasion selection, optional context, photo selection and validation, analyzing, error, retake, and result states.
- Login and required-login dialog.
- Settings, language selection, and account states.
- Shared application canvas, typography, navigation, buttons, inputs, cards, feedback, focus, loading, disabled, and responsive states.

Server handlers, model prompts, telemetry contracts, authentication behavior, weather behavior, and localized copy remain unchanged. New product features, theme switching, and a third-party component-library migration are outside scope.

## Source of Truth

`DESIGN.md` is the implementation source of truth for the Stitch reference. Its direction is Stark Minimalism: achromatic, flat, spacious, image-led, and editorial. Chivo is the sole UI typeface. Black is reserved for primary structure and active controls; neutral whites and grays provide hierarchy; red is used only for errors.

The existing home page is the closest local reference and will be normalized into the same shared token system rather than maintained as a separate visual island.

## Design System Architecture

Global CSS custom properties will define semantic tokens for canvas, surfaces, text, outlines, primary and error states; type scales; radii; spacing; content widths; and focus treatment. Components will consume semantic tokens rather than repeat literal legacy colors.

Shared visual primitives will be expressed through deliberately small reusable CSS classes for primary, secondary, and ghost actions; editorial cards; form controls; metadata labels; status treatments; and page shells. Existing React components will be retained where their behavior is sound. JSX changes will be limited to the wrappers, class names, labels, and decorative elements needed for consistent composition and accessible state communication.

Legacy warm browns, blue-green accents, Georgia typography, and decorative shadows will be removed from the affected UI. Depth will come from tonal surfaces, 0.5–1px neutral outlines, 2px active borders, and inverted black/white states.

## Page Composition

### Shared Shell and Navigation

Pages use a `#f9f9f9` application canvas with white focal surfaces. Mobile pages use 20px outer margins and 24px content gutters where appropriate. Major sections use 64px separation, groups use 32px, and compact stacks use 12px.

Bottom navigation remains fixed on mobile, with a white surface, black top border, uppercase labels, and a visible active marker. On wider screens it remains centered with the application content and avoids obscuring page actions. Safe-area padding is preserved.

### Home

The existing editorial home hierarchy remains: oversized hero, monochrome call to action, weather module, and indexed trend rows. Its page-specific custom properties and overrides will be folded into the shared tokens. Weather colors and trend swatches remain neutral so they do not compete with future outfit photography.

### Analyze Flow

The analyze page becomes a focused editorial workflow with a compact brand/step header, segmented black progress indicator, and a restrained central surface.

- Occasion choices use large outlined selection tiles or chips with strong labels and inverted hover/active treatment.
- Optional context uses uppercase field labels, white controls, neutral borders, and a 2px black focus state.
- Photo upload uses a large outlined image frame. A selected image remains full-bleed and color-accurate, with controls visually separated from the photograph.
- Analyzing uses a minimal monochrome spinner and concise status text without decorative color.
- Errors and photo-check failures use the error token plus explicit text; success and checking states stay neutral and do not rely on color alone.
- Results prioritize the submitted image, summary, fit assessment, strengths, and recommendations in a clear editorial sequence. Primary advice receives stronger structure without colored panels or shadows. Feedback and restart actions use the shared action hierarchy.

### Login and Required Login

Login becomes a centered editorial composition with a strong headline, concise supporting copy, a black primary action, and a restrained privacy note. The required-login dialog uses a roughly 90% white surface, 10px backdrop blur, neutral overlay, black outline, focus trapping, and the same action hierarchy. Existing authentication redirects and dialog semantics remain intact.

### Settings and Account

Settings uses the same page rhythm and typographic hierarchy as Home. The language selector is a standard shared form control. Account states use one outlined editorial card: avatar, identity metadata, error feedback, and sign-in/sign-out action all align to the shared tokens. Loading and signed-out states reserve stable space to reduce layout shift.

## Responsive Behavior

The implementation starts from the Stitch mobile layout and scales upward.

- Below 640px: fluid four-column mental model, 20px margins, full-width actions, and at least 44px touch targets.
- From 640px: increased 40px safe margins and more breathing room without shrinking readable text.
- Desktop: content can expand into a centered 12-column grid up to 1200px. Text-heavy flows retain a narrower readable column, while result photography and supporting analysis may form a balanced two-column composition when space permits.

No horizontal scrolling is acceptable at 320px. Fixed navigation and dialogs must respect viewport and safe-area insets.

## Accessibility and Interaction

All text and controls must meet WCAG-compatible contrast on their actual surfaces. Keyboard focus uses a clearly visible black outline with offset. State is communicated with labels or text in addition to border or color. Existing semantic headings, live regions, alert roles, dialog focus handling, and input labels are preserved or improved.

Hover styles must have equivalent focus-visible styles. Motion is limited and must honor `prefers-reduced-motion`. Buttons, links, selectors, and upload targets have a minimum 44px interactive area. Body weight 300 is used only at the defined 16px or 18px body scales.

## Implementation Boundaries

Primary implementation files are expected to include `src/app/globals.css`, the four page routes, and components under `src/features/home/components/`, `src/features/auth/components/`, and `src/features/outfit/components/`. The global layout may change only as needed to load or apply Chivo and shared page metadata.

The work should avoid adding a new runtime UI dependency. Existing icon packages may be used. Component behavior, hooks, network requests, safety validation, and localized message keys should not change unless a small accessible label is required; any new user-facing copy must be added across all supported locales.

## Verification

Automated verification will run:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm test:e2e` because the analyze, login, settings, and navigation flows are visually restructured

Browser verification will cover Home, Analyze occasion/photo/analyzing/result/error states where fixtures or mocks allow, Login, Settings signed-in/signed-out/loading/error states, and the required-login dialog at representative mobile and desktop widths. The visual review will check hierarchy, overflow, safe areas, focus visibility, disabled states, and consistency with `DESIGN.md`.

## Success Criteria

- Every user-facing route uses the same Chivo-based monochrome design system.
- No legacy warm palette, blue-green primary treatment, Georgia headline, or decorative shadow remains in the restyled surfaces.
- Photography is visually dominant and is not color-filtered or overlaid.
- Mobile layouts work at 320px and all interactive targets remain usable.
- Desktop layouts use space intentionally without stretching text-heavy content.
- Existing functional, authentication, privacy, localization, and safety tests continue to pass.

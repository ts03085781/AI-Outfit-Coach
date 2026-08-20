---
name: Haute Logic
source: Google Stitch
project: Smart Style AI
projectId: "4771117903189315119"
deviceType: MOBILE
colors:
  background: "#f9f9f9"
  surface: "#f9f9f9"
  surface-container-lowest: "#ffffff"
  surface-container-low: "#f3f3f4"
  surface-container: "#eeeeee"
  surface-container-high: "#e8e8e8"
  surface-container-highest: "#e2e2e2"
  on-surface: "#1a1c1c"
  on-surface-variant: "#4c4546"
  primary: "#000000"
  on-primary: "#ffffff"
  primary-container: "#1b1b1b"
  secondary: "#5d5f5f"
  on-secondary: "#ffffff"
  secondary-container: "#dcdddd"
  tertiary: "#000000"
  outline: "#7e7576"
  outline-variant: "#cfc4c5"
  error: "#ba1a1a"
  error-container: "#ffdad6"
typography:
  display-xl:
    fontFamily: Chivo
    fontSize: 64px
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Chivo
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Chivo
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Chivo
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.4
  body-lg:
    fontFamily: Chivo
    fontSize: 18px
    fontWeight: 300
    lineHeight: 1.6
  body-md:
    fontFamily: Chivo
    fontSize: 16px
    fontWeight: 300
    lineHeight: 1.6
  label-caps:
    fontFamily: Chivo
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.15em
  mono-label:
    fontFamily: Chivo
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.2
rounded:
  sm: 0.25rem
  default: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-safe: 40px
  stack-sm: 12px
  stack-md: 32px
  stack-lg: 64px
---

# Smart Style AI Design System

## Brand & Style

The visual direction is **Stark Minimalism**, inspired by high-end fashion editorials and architectural blueprints. The interface should feel clinical yet luxurious, removing decorative excess so that silhouettes, typography, and user photography remain the focal points.

The brand personality is authoritative, sophisticated, precise, and cool. Use expansive whitespace, sharp typography, and a deliberately achromatic palette to evoke a physical fashion lookbook.

## Color Usage

- **Primary — `#000000`:** Main text, iconography, active controls, and structural borders.
- **Canvas — `#FFFFFF`:** Primary content background and the highest-contrast surface.
- **Background — `#F9F9F9`:** Application-level background.
- **Secondary — `#F5F5F5`:** Subtle containers, tags, and hover states.
- **Tertiary — `#E0E0E0`:** Secondary borders, dividers, and disabled states.
- **Error — `#BA1A1A`:** Destructive or error feedback only.

Keep the application achromatic. Fashion photographs may contain color and should remain the primary visual emphasis.

## Typography

Use **Chivo** throughout the product.

- Headlines use weights `700–900`, tight tracking, and compact line height.
- Body text uses weight `300` and line height `1.6` for an airy editorial contrast.
- Navigation, metadata, and categories use small uppercase labels with wide tracking.
- Technical AI output and analysis tags use the `mono-label` scale.

## Layout & Spacing

- Desktop uses a fixed 12-column grid with a maximum width of `1200px`.
- Mobile uses a fluid 4-column grid.
- Default mobile page margin is `20px`.
- Default content gutter is `24px`.
- Use `64px` between major sections, `32px` between content groups, and `12px` for compact stacks.
- Treat whitespace as a functional part of the premium visual hierarchy.
- Preserve generous internal padding for touch targets even when mobile margins shrink.

## Elevation & Depth

The system avoids conventional drop shadows. Communicate depth using outlines, tonal surfaces, and inverted states.

- Secondary elements use `0.5px` low-contrast outlines.
- Primary focal points and active states use `2px` black outlines.
- Active controls invert from white/black to black/white.
- Glass effects are limited to overlays and modals: use approximately `90%` white opacity with `10px` backdrop blur.
- Do not introduce decorative shadows unless required for accessibility or platform behavior.

## Shape Language

- Buttons and inputs: `8px` radius.
- Medium containers: `12px` radius.
- Editorial cards and image frames: `16px` radius.
- Chips and tags: fully rounded.
- For nested containers, the inner radius should be smaller than the outer radius.

## Components

### Buttons

- **Primary:** Black background, white text, `2px` black border, no shadow.
- **Secondary:** White background, black text, `1px` black border.
- **Ghost:** Transparent background, no border, uppercase label typography.
- Active and selected buttons use an inverted black surface with white content.

### Input Fields

- Default: white background with a `0.5px #E0E0E0` border.
- Focus: `2px #000000` border with no glow or shadow.
- Place `label-caps` labels above fields.
- Validation messages should be concise and use the error token only when necessary.

### Cards

- Editorial cards use a `16px` radius and `0.5px #E0E0E0` border.
- Images bleed to the card edges with no internal image padding.
- Text regions below imagery use `24px` padding.
- Avoid shadows and unnecessary nested containers.

### Chips & Tags

- Use pill shapes with `#F5F5F5` background and black text.
- Use the `mono-label` type scale for AI-generated classifications and analysis metadata.
- Selected chips may invert to black background and white text.

### Navigation

- Use a fixed white header with a `1px` black bottom border.
- Navigation labels use `label-caps` typography.
- Active or hover states use a `2px` black underline.
- Mobile bottom navigation follows the same monochrome hierarchy and clearly distinguishes the active destination.

## Imagery

- User outfit photography is the product's dominant visual content.
- Prefer full-bleed crops with restrained framing.
- Do not apply decorative color overlays that distort clothing colors.
- Preserve clear contrast between controls and variable photo backgrounds.

## Accessibility

- Maintain WCAG-compatible text contrast against all neutral surfaces.
- Do not rely solely on border thickness or color to communicate state; pair it with labels, icons, or text.
- Keep interactive touch targets at least `44px × 44px`.
- Preserve visible keyboard focus indication within the monochrome system.
- Ensure light body weights remain readable at small sizes; do not use weight `300` below the defined body scales.

## Implementation Principles

- Use design tokens instead of isolated literal values in components.
- Keep the UI flat, editorial, and image-focused.
- Preserve the black-and-white identity across loading, empty, error, and disabled states.
- Reuse shared button, card, input, chip, and navigation primitives.
- Validate responsive behavior against the mobile-first Stitch screens before adding desktop adaptations.

---
name: Auditoría Electoral E-14
colors:
  surface: '#0c1516'
  surface-dim: '#0c1516'
  surface-bright: '#323b3c'
  surface-container-lowest: '#071011'
  surface-container-low: '#141d1e'
  surface-container: '#182122'
  surface-container-high: '#222c2d'
  surface-container-highest: '#2d3637'
  on-surface: '#dbe4e5'
  on-surface-variant: '#b9cbbc'
  inverse-surface: '#dbe4e5'
  inverse-on-surface: '#293233'
  outline: '#849587'
  outline-variant: '#3b4a3f'
  surface-tint: '#00e388'
  primary: '#beffd1'
  on-primary: '#00391e'
  primary-container: '#05f292'
  on-primary-container: '#00693c'
  inverse-primary: '#006d3f'
  secondary: '#ffdb9d'
  on-secondary: '#412d00'
  secondary-container: '#feb700'
  on-secondary-container: '#6b4b00'
  tertiary: '#ffecea'
  on-tertiary: '#68000b'
  tertiary-container: '#ffc6c2'
  on-tertiary-container: '#b61221'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#58ffa5'
  primary-fixed-dim: '#00e388'
  on-primary-fixed: '#00210f'
  on-primary-fixed-variant: '#00522e'
  secondary-fixed: '#ffdea8'
  secondary-fixed-dim: '#ffba20'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5e4200'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ae'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930014'
  background: '#0c1516'
  on-background: '#dbe4e5'
  surface-variant: '#2d3637'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 36px
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-data-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
  label-data-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
  label-data-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  label-code-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 12px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes an uncompromising tactical, high-integrity mission control aesthetic designed for field auditors, electoral delegates, and operations analysts verifying E-14 polling records. The visual identity draws from high-precision data terminals, mission-critical defense tooling, and specialized telemetry consoles. 

The emotional tone balances institutional sovereignty, absolute procedural veracity, and operational urgency. Field auditors operating under low-connectivity and high-glare environments require immediate situational comprehension with zero friction. The design movement synthesizes **Tactical Brutalism** and **Engineered Glass/Tonal Layering**: deliberate structural grids, razor-sharp technical boundaries, monospaced numeric readouts, and radiant spectral accents that signal validation states instantly without visual ambiguity.

## Colors

The palette operates on calibrated luminescence within deeply saturated cyan-black voids. Backgrounds do not use neutral grays; they utilize calibrated carbon-teal foundations (`#060d0d`, `#0a1314`, `#0f1c1d`) to reduce blue light eye strain while maximizing organic OLED contrast.

- **Primary (`#05f292`, `#00e699`):** Synthetic Emerald. Represents validated tallies, biometric confirmation, cryptographically verified hashes, and synchronized transmission states.
- **Secondary (`#ffb800`):** Caution Amber. Denotes pending validation, tally arithmetic discrepancies requiring human reconciliation, weak signal reception, or missing delegate signatures.
- **Tertiary (`#ff4d4d`):** Critical Hazard Crimson. Indicates spoiled ballot anomalies, hash verification mismatches, duplicate E-14 submissions, or perimeter audit alerts.
- **Surface Roles:**
  - Base Ground: `#060d0d`
  - Elevated Container / Field Surface: `#0a1314`
  - Interactive / Highlight Card: `#0f1c1d`
  - Subtle Technical Grid / Border: `#182829`
- **Text & Telemetry:**
  - High Emphasis: `#e0f2ee`
  - Data / Label Neutral: `#8ea8a4`
  - Subdued / Trace: `#475e5b`

## Typography

The typographic hierarchy implements three coordinated structural engines:

1. **Space Grotesk (Display & Section Headers):** Delivers geometric precision and modern institutional authority, preventing the UI from feeling like an unstyled raw terminal.
2. **Inter (Body Copy & Form Controls):** Selected for rapid scanning and legibility across low-resolution mobile screens and varying ambient lighting conditions.
3. **JetBrains Mono (Audit Telemetry, Timestamps, & Tallies):** Used for table rows, vote counts, mesa/table IDs, ballot verification hashes, and cryptographic signatures. All numeric cells strictly employ tabular figures to ensure decimal point and column alignment across vertical lists.

## Layout & Spacing

The layout is built upon an 8pt operational grid optimized for field mobile ergonomics and dense desktop dashboard monitors:

- **Mobile Viewport (360px - 767px):** Single-column tactical stack with persistent bottom command action bars. Margins contract to `1rem` (`margin-mobile`), and form inputs expand to a minimum 48px tap target to allow single-handed input while handling paper documents.
- **Tablet / Split View (768px - 1023px):** 6-column layout allowing dual-pane operation: digitalized E-14 image preview pinned alongside OCR extraction data fields.
- **Desktop Command Station (1024px+):** 12-column fixed-fluid hybrid grid. Pinned telemetry status column (2 cols), primary comparison canvas (7 cols), and audit event log / exception feed (3 cols). Gutters are locked at `1rem` to enforce tight, data-dense scanning without wasted canvas acreage.

## Elevation & Depth

Visual hierarchy abandons diffuse organic drop shadows in favor of **Crisp Tonal Layering and Cybernetic Edge Emittance**:

- **Ground Level (Elevation 0):** Canvas base `#060d0d`.
- **Structural Modules (Elevation 1):** `#0a1314` framed with a 1px border of `#182829`. Zero blur shadow.
- **Active / Interactive Elements (Elevation 2):** `#0f1c1d` surfaced with 1px border `#23393b`.
- **Focused & Flagged States (Spectral Edge):** Critical attention items (discrepancy inputs, unverified totals) drop tonal containment and project a hard 1px outline accompanied by a restrained glow (`0 0 12px rgba(5, 242, 146, 0.2)` for primary states; `0 0 12px rgba(255, 77, 77, 0.25)` for discrepancy alerts).
- **Overlays / Modal Validation Sheets:** Semi-opaque `#060d0d`/90 with an active hardware backdrop blur filter (16px blur) and 1px top highlight `#05f292`.

## Shapes

The geometric form factor relies on **Level 1 (Soft)** rounding (4px default radii). This restrained curvature delivers sharp structural discipline, conveying tactical precision and institutional permanence without the harsh ergonomics of raw 0px corners.

- **Buttons, Text Inputs, and Data Cells:** Exactly `4px` corner radii (`0.25rem`).
- **Telemetry Cards and Audit Containers:** `8px` corner radii (`0.5rem`).
- **Pill Status Badges:** Not used. Status chips use calibrated `4px` tags to maintain a structured tabular silhouette.

## Components

### Buttons
- **Primary Tactical Action (Validate / Transmit):** High-luminance emerald `#05f292` fill with dark-carbon text `#060d0d` (`font-weight: 700`, JetBrains Mono or Space Grotesk). Active state scales slightly (0.98) with an intense neon outline.
- **Secondary (Inspect / Flag):** Transparent ground with a 1px `#23393b` border and `#8ea8a4` text. On hover/focus: border turns to `#05f292` and text shifts to `#e0f2ee`.
- **Hazard / Reject Action:** Fill `#241215` with 1px border `#ff4d4d` and text `#ff4d4d`.

### Audit Chips & Status Indicators
- Rectangular with 4px radii, mono-spaced uppercase typography (`label-code-xs`).
- **Verified (Transmitido):** `#05f292`/10 background, `#05f292` text, 1px `#05f292`/30 border, prefixed by a filled green dot `●`.
- **Divergence (Discrepancia E-14):** `#ffb800`/10 background, `#ffb800` text, 1px `#ffb800`/30 border, prefixed by `▲`.
- **Alerta / Fraude Potencial:** `#ff4d4d`/10 background, `#ff4d4d` text, 1px `#ff4d4d`/40 border, prefixed by `■`.

### Lists & Tally Grids
- Rendered as strict horizontal matrices. Each candidate row alternates with hairline `#182829` dividers.
- Candidate code and name in `Inter 14px Medium`; vote tally rendered in `JetBrains Mono 16px Bold` inside a dedicated, right-aligned numeric container with a dark recessed background (`#060d0d`).

### Input Fields (Tally Entry & Mesa Search)
- Background: `#060d0d`. Border: 1px `#182829`. Text: `#e0f2ee`.
- Focused state: 1px `#05f292` border with ambient outer glow.
- Numeric counters are monospaced with built-in sanity checks: values exceeding maximum registered voters immediately flip the border to `#ff4d4d` with real-time discrepancy warnings.

### Checkboxes & Segmented Controls
- Checkboxes: 18x18px squares with 2px radius and 1px border `#23393b`. Checked state features a `#05f292` fill with a `#060d0d` crisp checkmark glyph.
- Segmented tab switches: Dark housing `#060d0d` containing tactile `#0f1c1d` active sliders with bright teal text indicator labels.

### E-14 Digitalization Card
- A purpose-built component featuring an embedded high-resolution canvas with split-view zoom, digital hash validation tag, GPS coordinates of the polling station, and quick-reconciliation counters displaying OCR tally versus physical auditor input side by side.
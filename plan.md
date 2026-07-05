# Pulseboard Version Log

This file is now a delivered-change log (not a forward plan).

## v2.12.0 - Premium Light Mode Alignment + Motion Polish (2026-07-05)

- Reworked light-mode visual hierarchy to match dark-mode quality.
- Removed remaining blue casts and hardcoded blue accents from v2 surfaces/components.
- Refined active pills and primary actions (Insights + Log) to lighter premium gradients.
- Added light-mode-only depth treatment for cards/hero/tiles.
- Added typography polish (heading weight/tracking) and softer secondary borders.
- Improved interaction quality with smoother easing/timing and subtle hover/focus behavior.

## v2.11.0 - Donut Readability and Context Clarity (2026-07-05)

- Donut segments changed to rounded capsule-style arcs and thinner ring profile.
- Segment label readability improved by moving percentages outside ring and increasing contrast.
- Mix context copy now handles edge cases:
  - selected-day-only
  - month-to-date range
  - no sessions up to selected day
- Summary and donut-center context are now aligned in wording intent.

## v2.10.0 - Theme Architecture and Dark Palette Upgrade (2026-07-05)

- Centralized theme tokens in static/v2/palette.css as the quick-edit source.
- Enabled runtime-reactive chart theming through token getters in static/v2/chart-theme.js.
- Added persistent dark-mode toggle across Insights and Log.
- Rebalanced dark palette toward muted premium green/olive direction.
- Updated mix legend/segment palette for stronger non-blue coherence.

## v2.9.0 - Time-Series Consistency and Gradient Fixes (2026-07-05)

- Unified concentration and weight charts with shared renderer in static/v2/charts/shared-line-style.js.
- Fixed weight area shading baseline/fade behavior to match concentration chart quality.
- Improved line/area continuity and visual parity across both charts.

## v2.8.0 - Mix + Heatmap Context Refinement (2026-07-05)

- Added clear mix context messaging for full-month vs month-to-date states.
- Added reset-to-full-month behavior for mix after heatmap day selection.
- Normalized heatmap month keys to YYYY-MM for reliable multi-month filtering.
- Removed implicit day auto-selection for clearer user intent.

## v2.7.0 - Month Filter UX Overhaul (2026-07-05)

- Replaced native multi-select with custom month dropdown + checkbox menu.
- Added cleaner controls: Select months, Default View, Done, Apply Months.
- Set default filter window to current month + previous 3 months.
- Added filter helper copy and improved z-index/layering to avoid dropdown clipping.

## v2.6.0 - Context-Aware Insights and Narrative Accuracy (2026-07-05)

- Updated "latest" insight logic to use current-or-prior data point semantics.
- Made KPI tiles and summaries window-aware to selected month range.
- Improved narrative summaries for concentration, weight, heatmap, and mix.

## v2.5.0 - State and Chart System Foundation (2026-07-04 to 2026-07-05)

- Added modular chart foundation in static/v2:
  - chart-core.js
  - chart-theme.js
  - chart-axes.js
  - chart-interactions.js
  - chart-registry.js
  - insights-state.js
- Refactored rendering orchestration for cleaner updates and shared state.
- Added lightweight chart timing instrumentation in dev mode.

## v2.4.0 - Reliability and Contract Safeguards (2026-07-04 to 2026-07-05)

- Hardened API contract expectations with helper tests.
- Preserved/validated endpoint behavior under iterative UI changes.
- Repeated regression checks stayed green (test_api_contract_helpers.py).

## v2.3.0 - v2 Experience Activation (2026-07-04)

- Activated v2 routes and templates for Log + Insights experience.
- Established new frontend architecture under static/v2 and templates/v2*.html.

## Legacy Status

- Legacy mode has been sunset.
- Canonical routes:
  - / -> v2 log
  - /insights -> v2 insights

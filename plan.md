# Premium D3 Insights Roadmap (5 Back-to-Back Sprints)

This plan turns the current insights experience into a premium, mobile-first D3 product with synchronized interactions, stronger narrative value, and reusable chart architecture.

## Current Baseline

- Frontend chart rendering: static/v2/charts.js
- Insights orchestration: static/v2/insights.js
- History rendering utilities: static/v2/history.js
- JSON data endpoints: main.py under /api/insights/*, /api/history, /api/summary
- Mobile and visual concerns already identified: crowded states, low interaction depth, and weak cross-chart continuity

## Sprint Cadence

- Sprint length: 4-5 working days each
- Delivery rhythm: design + build + QA in same sprint
- Rollout: feature flag per sprint capability where possible
- Definition of done for each sprint:
  - Mobile UX validated (small and large viewport)
  - No new failing tests
  - No console/runtime errors in target page
  - Feature-level acceptance checklist complete

---

## Plan 1: Chart System Foundation and Visual Language

### Goal
Establish a reusable D3 foundation so all charts share premium visuals, interaction primitives, and performance behavior.

### Technical Scope

1. Create a chart core module:
- Add static/v2/chart-core.js
- Export:
  - createChartFrame(container, options)
  - applyTheme(svg, theme)
  - renderEmptyState(frame, message)
  - renderSkeletonState(frame)
  - destroyChart(container)

2. Define chart tokens and motion constants:
- Add static/v2/chart-theme.js
- Include:
  - semantic color tokens (positive, caution, neutral, event)
  - typography sizes and weights
  - spacing/radius/shadow scale
  - transition durations and easing
- Ensure no hard-coded chart colors remain in chart modules except mapped token names.

3. Build shared interaction primitives:
- Add static/v2/chart-interactions.js
- Include:
  - tooltip manager (desktop hover + mobile tap)
  - focus ring/highlight state helper
  - pointer normalization helper (mouse, touch)
  - accessibility helper for reduced motion

4. Standardize axis and annotation rendering:
- Add static/v2/chart-axes.js
- Provide reusable axis renderers with consistent tick density:
  - mobile tick budget
  - desktop tick budget
  - truncation and smart date formatting

5. Refactor existing charts to consume core utilities:
- Update static/v2/charts.js to use the shared modules.

### Backend Changes
None required for this sprint.

### QA and Validation

- Snapshot-style DOM checks for:
  - no-data state
  - loading/skeleton state
  - standard frame rendering
- Manual validation:
  - iPhone-sized viewport
  - tablet-sized viewport
  - desktop

### Deliverables

- New foundational modules committed
- Existing charts visually consistent
- Reduced code duplication in charts.js
- Baseline performance instrumentation (first render and update timing logs in dev mode)

### Risks and Mitigation

- Risk: Refactor regressions in all charts
- Mitigation: Keep external render signatures stable and refactor internally first

---

## Plan 2: Concentration and Weight as Premium Time-Series Components

### Goal
Upgrade line charts into insight-driven components with layered geometry, event storytelling, and stronger interpretability.

### Technical Scope

1. Split generic line chart into specialized components:
- Add static/v2/charts/concentration-chart.js
- Add static/v2/charts/weight-chart.js
- Keep thin adapter methods in static/v2/charts.js for backward compatibility.

2. Concentration chart enhancements:
- Layer structure:
  - base gradient area (concentration envelope)
  - primary trend line
  - event pins for injections
- Add contextual labels:
  - injection count
  - latest estimated concentration
- Add smart marker clustering for dense ranges on small screens.

3. Weight chart enhancements:
- Render raw points + smoothed trend line (rolling or spline approach)
- Add weekly delta callouts anchored to end-of-window
- Add optional target band rendering (config-driven)

4. Add premium tooltip card:
- Shared tooltip shell with chart-specific rows
- Mobile: bottom-sheet style anchored card
- Desktop: cursor-follow floating card with snap tolerance

5. Add transitions:
- Initial reveal animation (path draw + fade)
- Update transitions for filter change with continuity

### Backend Changes

1. Extend weight trend payload (optional but recommended):
- Include trend_points if smoothed trend is precomputed server-side
- Include latest value and weekly delta in meta

2. Extend concentration payload:
- Include summary meta (max, min, latest)

### QA and Validation

- Unit-style checks for:
  - parsing dates and numeric values
  - handling null/missing points
- Visual checks:
  - no label collisions on mobile width
  - marker readability under dense event windows

### Deliverables

- Dedicated concentration and weight chart modules
- Premium interactions and annotations for both charts
- Stable API fallback when enhanced metadata is absent

### Risks and Mitigation

- Risk: Over-annotation causing clutter on mobile
- Mitigation: progressive disclosure (show top-priority annotations only on small screens)

---

## Plan 3: Workout Mix and Heatmap Redesign with Narrative Focus

### Goal
Transform composition and cadence visuals into premium story charts that explain behavior change and consistency.

### Technical Scope

1. Workout mix redesign:
- Replace current stacked area-only presentation with dual-mode component:
  - mode A: stacked timeline (month-over-month composition)
  - mode B: radial composition snapshot for selected period
- Add mode toggle with morph transition
- Add dominant-mode and shift-vs-prior annotations

2. Heatmap redesign:
- Convert to calendar-like layout with clear monthly segmentation
- Use perceptual color scale with explicit low/high legend
- Add streak overlay logic:
  - identify contiguous active days
  - render subtle connector path
- Add day detail popover with session count, type blend, and value

3. Mobile readability tuning:
- Dynamic label elision policy
- Tap-first interaction model for heatmap cell inspection
- Keep touch targets >= 44 px where actionable

4. Performance tuning for dense cell draws:
- Use keyed joins to avoid full redraw when possible
- Defer non-critical labels until idle frame

### Backend Changes

1. Heatmap endpoint enrichment (recommended):
- Include per-day type breakdown object
- Include per-day value total

2. Mix endpoint enrichment:
- Include prior-period deltas by category

### QA and Validation

- Test cases for:
  - empty month windows
  - sparse workout periods
  - high-density periods
- Visual acceptance:
  - all labels legible on small viewport
  - no interactive dead zones

### Deliverables

- New mix chart module with toggle modes
- New heatmap module with streaks and richer day drilldown
- Improved mobile legibility and interaction confidence

### Risks and Mitigation

- Risk: Complex transitions reduce frame rate
- Mitigation: prefer opacity/transform transitions over expensive path recompute during animation

---

## Plan 4: Cross-Chart Synchronization and State Architecture

### Goal
Create a cohesive analytics surface where interactions are linked across charts and filters are consistently applied.

### Technical Scope

1. Introduce shared insights state store:
- Add static/v2/insights-state.js
- State domains:
  - dateRange
  - selectedPointDate
  - selectedCategory
  - activeChartMode
- Include pub/sub event emitter and typed payload contracts

2. Introduce chart registry and lifecycle management:
- Add static/v2/chart-registry.js
- Responsibilities:
  - init charts once
  - update charts on state changes
  - destroy on page unload/navigation

3. Update insights orchestration:
- Refactor static/v2/insights.js to:
  - initialize store
  - load data once per filter update
  - dispatch cross-chart focus events

4. Synchronized interactions:
- Hover/tap point in one time-series chart highlights corresponding date in others where possible
- Heatmap day selection updates summary callouts and mix context
- Consistent selected state visuals across all charts

5. Error and fallback behavior:
- Graceful partial rendering when one endpoint fails
- Per-chart status indicators instead of single global failure state

### Backend Changes

1. Optional batching endpoint (optimization):
- Add /api/insights/bundle that returns all chart payloads in one response
- Keep existing endpoints for compatibility

### QA and Validation

- Integration tests for state transitions:
  - date change
  - point selection
  - chart mode toggle
- Manual test matrix for synchronization behaviors on mobile and desktop

### Deliverables

- Shared state architecture in place
- Cross-chart synchronized focus implemented
- Improved resilience and loading behavior

### Risks and Mitigation

- Risk: Event-loop complexity and stale state bugs
- Mitigation: single source of truth store + immutable update patterns + event naming conventions

---

## Plan 5: Premium Product Polish, Performance Hardening, and Launch Readiness

### Goal
Finalize a polished, high-confidence insights product with strong perceived quality, accessibility, and production readiness.

### Technical Scope

1. Motion and choreography polish:
- Sequence chart reveals on first load (staggered)
- Add subtle transitions for filter updates and state changes
- Respect prefers-reduced-motion media query

2. Narrative framing and insight cards:
- Add concise generated insight strips above each chart:
  - trend direction
  - volatility
  - best/worst windows
- Add confidence language when data is sparse

3. Accessibility hardening:
- Keyboard accessibility for chart mode toggles and controls
- Color contrast verification for chart elements and labels
- Tooltip/card content mirrored in accessible text region

4. Performance hardening:
- Measure and optimize:
  - first meaningful chart render
  - filter update latency
  - interaction response latency
- Add debounced resize handling per chart instance
- Avoid unnecessary full redraws

5. Observability and regression safety:
- Add lightweight frontend diagnostics in dev mode
- Add API contract checks for required chart fields
- Expand pytest helpers for any backend payload enrichments introduced in prior sprints

### Backend Changes

- Finalize any payload schema additions from Sprints 2-4
- Update test fixtures and helper tests to assert schema stability

### QA and Validation

- Final acceptance run:
  - mobile first (small viewport)
  - desktop follow-up
- Runtime checks:
  - no unhandled promise rejections
  - no chart initialization race conditions

### Deliverables

- Production-ready premium charting experience
- Accessibility and performance baselines documented
- Launch checklist completed

### Risks and Mitigation

- Risk: Late polish introduces regressions
- Mitigation: freeze feature scope at sprint start and reserve final day for stabilization

---

## Back-to-Back Sprint Execution Order

1. Plan 1 (Foundation)
2. Plan 2 (Time-series premium charts)
3. Plan 3 (Mix + heatmap premium redesign)
4. Plan 4 (Synchronized interaction architecture)
5. Plan 5 (Polish, perf, accessibility, launch)

## Suggested Working Agreement for Each Sprint

- Day 1: design spec + data contract confirmation
- Day 2-3: implementation
- Day 4: mobile QA + fixes
- Day 5: stabilization, tests, and handoff notes

## Exit Criteria Across Entire Program

- Insights page feels premium on mobile and desktop
- Every chart has clear narrative purpose and readable interactions
- Shared interaction model is consistent and predictable
- Payload contracts are stable and test-covered
- No known P1/P2 UX defects remain

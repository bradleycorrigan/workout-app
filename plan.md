# Pulseboard Next-Level Product Plan

This document is a forward-looking product plan.
For shipped changes, see version_log.md.

## Product North Star

Pulseboard should be a daily decision companion, not only a tracker.
Each session should answer:
- What changed?
- Why did it change?
- What should I do next?

Primary outcome:
- A user can open the app, understand their current state, and choose one clear action in under 30 seconds.

## Strategic Pillars

1. Clarity
- Faster comprehension of trends and context.
- Narrative summaries that are explicit and trustworthy.

2. Guidance
- Action-focused recommendations tied to current patterns.
- Confidence-aware language when data is sparse.

3. Habit Loop
- Lightweight recurring review cycle that reinforces consistent logging.
- High-signal nudges with minimal notification fatigue.

4. Premium Quality
- Consistent interaction model across Log and Insights.
- Best-in-class visual polish, responsiveness, and accessibility.

5. Reliability
- Stable API contracts, resilient partial rendering, and predictable performance.

## User Segments and Core Jobs

Primary segments:
- Consistency-focused athlete
- Body-composition focused lifter

Core jobs-to-be-done:
- Log quickly with low friction.
- Understand progress over selected windows.
- See behavior-to-outcome relationships.
- Receive one useful recommendation for today.

## 12-Week Roadmap

### Phase 1 (Weeks 1-2): Product Foundation and Measurement

Goals:
- Define product success model and instrument behavior.

Scope:
- Finalize user promise and top personas.
- Build KPI tree and event taxonomy.
- Add analytics instrumentation for:
  - log submitted
  - month filter applied
  - heatmap day selected
  - mix reset used
  - insight card viewed
  - recommendation accepted/dismissed
- Build weekly product dashboard.

Deliverables:
- Product spec v1.
- KPI dashboard v1.
- Event map and naming conventions.

### Phase 2 (Weeks 3-5): Insight-to-Action Layer

Goals:
- Move from descriptive charts to actionable guidance.

Scope:
- Add a "Today Brief" module at top of Insights:
  - trend summary
  - risk/opportunity note
  - one recommended action
- Introduce behavior-to-outcome cues (with confidence labels).
- Add goals model:
  - workouts per week
  - weigh-in cadence
  - consistency targets
- Add recommendation engine v1 (rules-based, explainable).

Deliverables:
- Actionable brief experience.
- Recommendation interaction tracking.

### Phase 3 (Weeks 6-8): Retention and Habit Systems

Goals:
- Increase repeat usage and sustained logging.

Scope:
- Weekly Review surface:
  - wins
  - friction points
  - suggested focus for next week
- Lightweight reminder logic with anti-spam guardrails.
- Meaningful streaks tied to consistency behaviors.
- Personal baseline and milestone system.

Deliverables:
- Weekly review flow.
- Nudge policy and cadence controls.

### Phase 4 (Weeks 9-12): Premium Product Layer

Goals:
- Add advanced value suitable for premium positioning.

Scope:
- Advanced analysis features:
  - period-vs-period comparisons
  - trend stability/variance scoring
  - confidence-backed interpretation
- Planning tools:
  - weekly plan builder
  - simple scenario preview based on current pace
- Export/share support for coach-ready summaries.
- Adaptive dashboard ordering based on user behavior.

Deliverables:
- Premium feature bundle v1.
- Packaging and pricing test plan.

## Success Metrics

Activation:
- % of new users who complete 3+ logs in first 7 days.

Engagement:
- Weekly active users.
- Sessions per weekly active user.
- % users viewing Today Brief.

Retention:
- Week-4 retention.
- Repeat Weekly Review completion rate.

Outcome quality:
- % users with improved consistency over baseline.
- Recommendation interaction and completion rate.

Performance and quality:
- Median log flow completion time.
- Median insights load and update latency.
- Runtime error rate and endpoint reliability.

## Experience and Quality Standards

UX:
- Mobile-first interactions with desktop parity.
- No ambiguous context text in edge cases.
- All actionable controls clearly state scope/time window.

Accessibility:
- Keyboard-operable controls.
- Color contrast validated for all themes.
- Reduced-motion support preserved.

Performance:
- Fast first meaningful render.
- Incremental redraws where possible.
- Stable behavior under partial API failures.

## Technical Execution Notes

Frontend:
- Keep token-driven theme architecture as single source of truth.
- Continue modular chart approach under static/v2/charts.
- Use shared state and chart registry for cross-chart synchronization.

Backend:
- Keep payload contracts explicit and version-safe.
- Add optional bundle endpoint only if latency profiling shows need.
- Maintain helper tests for schema stability.

Observability:
- Add product-level events in addition to dev chart timing logs.
- Keep weekly review of errors, latency, and behavior funnel metrics.

## Risks and Mitigations

1. Insight overload
- Mitigation: progressive disclosure and concise defaults.

2. Recommendation trust risk
- Mitigation: explainability + confidence language + conservative rules.

3. Scope creep during polish
- Mitigation: phase gates and explicit acceptance criteria per phase.

4. Regression risk from rapid iteration
- Mitigation: maintain API helper tests and targeted UI validation checklist.

## Working Rhythm

Weekly:
- KPI review and experiment decisions.
- One product quality review pass.

Biweekly:
- Ship one meaningful user-visible increment.

Monthly:
- User interviews and roadmap adjustment.

## Acceptance Criteria for Plan Completion

- Users consistently receive one clear action from Insights.
- Retention and engagement targets trend upward across two release cycles.
- Premium quality bar is maintained in both light and dark modes.
- No unresolved P1/P2 product issues remain in core log + insight flows.

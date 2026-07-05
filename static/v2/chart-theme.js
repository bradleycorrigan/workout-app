function cssVar(name, fallback = "currentColor") {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export const CHART_THEME = {
  semantic: {
    get positive() { return cssVar("--pb-brand"); },
    get positiveSoft() { return cssVar("--pb-brand-soft"); },
    get caution() { return cssVar("--pb-c4"); },
    get neutral() { return cssVar("--pb-c4"); },
    get neutralSoft() { return cssVar("--pb-c1"); },
    get focus() { return cssVar("--pb-focus"); },
    get onBrand() { return cssVar("--pb-on-brand"); },
  },
  palette: {
    get concentration() { return cssVar("--pb-line-primary"); },
    get weight() { return cssVar("--pb-line-primary"); },
    get mixGym() { return cssVar("--pb-mix-gym"); },
    get mixPool() { return cssVar("--pb-mix-pool"); },
    get mixLido() { return cssVar("--pb-mix-lido"); },
    get heatmapHigh() { return cssVar("--pb-c3"); },
    get grid() { return cssVar("--pb-grid"); },
    get axis() { return cssVar("--pb-axis"); },
    get text() { return cssVar("--pb-ink-soft"); },
    get textMuted() { return cssVar("--pb-ink-muted"); },
    get textStrong() { return cssVar("--pb-heading"); },
    get surfaceStrong() { return cssVar("--pb-surface-strong"); },
    get contrastStroke() { return cssVar("--pb-on-brand"); },
    get detailText() { return cssVar("--pb-ink"); },
  },
  typography: {
    axis: 11,
    annotation: 10,
    label: 11,
    empty: 13,
  },
  spacing: {
    radiusSm: 3,
    radiusMd: 4,
  },
};

export const CHART_MOTION = {
  revealMs: 340,
  updateMs: 240,
  fadeMs: 180,
  ease: "cubic-out",
};

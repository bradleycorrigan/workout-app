import { CHART_THEME } from "./chart-theme.js";

const d3 = window.d3;

if (!d3) {
  throw new Error("D3 failed to load. Check the CDN script include in v2 template.");
}

function chartDebugEnabled() {
  return window.localStorage?.getItem("pulseboard:chart-debug") === "1" || window.__PB_DEV_CHARTS === true;
}

export function withChartTiming(label, fn) {
  const start = performance.now();
  const result = fn();
  if (chartDebugEnabled()) {
    const elapsed = Math.round((performance.now() - start) * 10) / 10;
    console.debug(`[charts] ${label}: ${elapsed}ms`);
  }
  return result;
}

export function destroyChart(root) {
  if (!root) return;
  root.innerHTML = "";
}

export function createChartFrame(root, options = {}) {
  destroyChart(root);

  const width = root.clientWidth || 320;
  const ratio = options.ratio ?? 0.58;
  const minHeight = options.minHeight ?? 220;
  const height = Math.max(minHeight, Math.floor(width * ratio));

  const svg = d3
    .select(root)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("width", "100%")
    .style("height", "auto")
    .attr("role", "img");

  return { svg, width, height };
}

export function applyTheme(svg) {
  svg.attr("aria-label", "Pulseboard chart");
}

export function renderEmptyState(frame, message = "No data for selected filters") {
  const { svg, width, height } = frame;
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height / 2)
    .attr("text-anchor", "middle")
    .attr("fill", CHART_THEME.palette.text)
    .attr("font-size", CHART_THEME.typography.empty)
    .text(message);
}

export function renderSkeletonState(frame) {
  const { svg, width, height } = frame;
  const bars = 4;
  const pad = 14;
  const barW = (width - pad * (bars + 1)) / bars;
  const maxH = height * 0.6;

  for (let i = 0; i < bars; i += 1) {
    const h = maxH * (0.45 + i * 0.12);
    svg
      .append("rect")
      .attr("x", pad + i * (barW + pad))
      .attr("y", height - h - 12)
      .attr("width", barW)
      .attr("height", h)
      .attr("rx", 6)
      .attr("fill", CHART_THEME.palette.grid)
      .attr("opacity", 0.5);
  }
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

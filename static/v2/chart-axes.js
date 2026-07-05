import { CHART_THEME } from "./chart-theme.js";

const d3 = window.d3;

function styleAxis(axisSelection) {
  axisSelection
    .selectAll("text")
    .attr("fill", CHART_THEME.palette.text)
    .attr("font-size", CHART_THEME.typography.axis);
}

export function isMobileViewport() {
  return window.matchMedia?.("(max-width: 720px)")?.matches === true;
}

export function renderYAxis(g, yScale, innerW, opts = {}) {
  const ticks = opts.ticks ?? (isMobileViewport() ? 3 : 4);
  const axis = d3.axisLeft(yScale).ticks(ticks).tickSize(-innerW);
  if (opts.tickFormat) axis.tickFormat(opts.tickFormat);

  const axisG = g.append("g").call(axis);
  axisG.selectAll("line").attr("stroke", CHART_THEME.palette.grid);
  axisG.selectAll("path").attr("stroke", "none");
  styleAxis(axisG);
}

export function renderXAxis(g, xScale, innerH, opts = {}) {
  const ticks = opts.ticks ?? (isMobileViewport() ? 4 : 5);
  const axis = d3.axisBottom(xScale).ticks(ticks);
  if (opts.tickFormat) axis.tickFormat(opts.tickFormat);
  if (opts.tickSize === 0) axis.tickSize(0);

  const axisG = g.append("g").attr("transform", `translate(0,${innerH})`).call(axis);
  axisG.selectAll("line").attr("stroke", CHART_THEME.palette.axis);
  axisG.selectAll("path").attr("stroke", CHART_THEME.palette.axis);
  styleAxis(axisG);
}

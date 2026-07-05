import { CHART_MOTION } from "../chart-theme.js";
import { transitionIfAllowed } from "../chart-interactions.js";

const d3 = window.d3;

export function sharedLineCurve() {
  return d3.curveMonotoneX;
}

export function drawSharedShadedLine({
  svg,
  g,
  points,
  x,
  y,
  value,
  color,
  gradientPrefix,
  baselineY,
}) {
  const gradientId = `${gradientPrefix}-${Math.random().toString(36).slice(2)}`;
  const defs = svg.append("defs");
  const gradient = defs
    .append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "0%")
    .attr("y2", "100%");

  gradient.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.28);
  gradient.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0);

  const y0 = Number.isFinite(baselineY) ? baselineY : y.range()[0];

  const area = d3
    .area()
    .x((d) => x(d.date))
    .y0(y0)
    .y1((d) => y(value(d)))
    .curve(sharedLineCurve());

  const line = d3
    .line()
    .x((d) => x(d.date))
    .y((d) => y(value(d)))
    .curve(sharedLineCurve());

  const areaPath = g.append("path").datum(points).attr("fill", `url(#${gradientId})`).attr("d", area).attr("opacity", 0);
  transitionIfAllowed(areaPath, CHART_MOTION.revealMs).attr("opacity", 1);

  const linePath = g
    .append("path")
    .datum(points)
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 3.1)
    .attr("stroke-linecap", "round")
    .attr("d", line)
    .attr("opacity", 0);
  transitionIfAllowed(linePath, CHART_MOTION.revealMs).attr("opacity", 1);
}

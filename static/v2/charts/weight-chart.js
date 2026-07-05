import { createChartFrame, applyTheme, renderEmptyState, withChartTiming } from "../chart-core.js";
import { renderXAxis, renderYAxis } from "../chart-axes.js";
import { CHART_THEME } from "../chart-theme.js";
import { createTooltip, normalizePointer, transitionIfAllowed } from "../chart-interactions.js";
import { drawSharedShadedLine } from "./shared-line-style.js";

const d3 = window.d3;

function parseWeightPoints(points) {
  return (points || [])
    .map((d) => ({
      date: new Date(d.date),
      dateKey: String(d.date),
      weight: Number(d.weight_kg),
      weekly: d.weekly_diff_kg === null || d.weekly_diff_kg === undefined ? null : Number(d.weekly_diff_kg),
    }))
    .filter((d) => !Number.isNaN(d.weight))
    .sort((a, b) => a.date - b.date);
}

function tooltipHtml(point) {
  const date = d3.timeFormat("%d %b %Y")(point.date);
  const weekly = point.weekly;
  const weeklyText = weekly === null || Number.isNaN(weekly) ? "n/a" : `${weekly > 0 ? "+" : ""}${weekly.toFixed(2)} kg`;

  return `<strong>${date}</strong><br>Weight: ${point.weight.toFixed(2)} kg<br>7-day: ${weeklyText}`;
}

export function renderWeightTrendChart(rootId, payload = {}, options = {}) {
  const root = document.getElementById(rootId);
  if (!root) return undefined;

  return withChartTiming(`weight:${rootId}`, () => {
    const frame = createChartFrame(root);
    applyTheme(frame.svg);

    const parsed = parseWeightPoints(payload.points || []);
    if (!parsed.length) {
      renderEmptyState(frame);
      return;
    }

    const { svg, width, height } = frame;
    const margin = { top: 16, right: 22, bottom: 34, left: 50 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const minY = d3.min(parsed, (d) => d.weight) ?? 0;
    const maxY = d3.max(parsed, (d) => d.weight) ?? 1;
    const pad = Math.max(0.6, (maxY - minY) * 0.12);

    const x = d3.scaleTime().domain(d3.extent(parsed, (d) => d.date)).range([0, innerW]);
    const y = d3.scaleLinear().domain([minY - pad, maxY + pad]).nice().range([innerH, 0]);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    renderYAxis(g, y, innerW);
    renderXAxis(g, x, innerH);

    const targetBand = options.targetBand;
    if (targetBand && Number.isFinite(targetBand.min) && Number.isFinite(targetBand.max)) {
      g.append("rect")
        .attr("x", 0)
        .attr("y", y(targetBand.max))
        .attr("width", innerW)
        .attr("height", Math.max(0, y(targetBand.min) - y(targetBand.max)))
        .attr("fill", CHART_THEME.semantic.positive)
        .attr("fill-opacity", 0.08);

      if (targetBand.label) {
        g.append("text")
          .attr("x", 8)
          .attr("y", y(targetBand.max) + 12)
          .attr("font-size", CHART_THEME.typography.annotation)
          .attr("fill", CHART_THEME.semantic.positive)
          .text(targetBand.label);
      }
    }

    drawSharedShadedLine({
      svg,
      g,
      points: parsed,
      x,
      y,
      value: (d) => d.weight,
      color: CHART_THEME.palette.weight,
      gradientPrefix: "weight-gradient",
      baselineY: innerH,
    });

    g.selectAll(".weight-dot")
      .data(parsed)
      .join("circle")
      .attr("class", "weight-dot")
      .attr("cx", (d) => x(d.date))
      .attr("cy", (d) => y(d.weight))
      .attr("r", 2.8)
      .attr("fill", CHART_THEME.palette.surfaceStrong)
      .attr("stroke", CHART_THEME.palette.weight)
      .attr("stroke-width", 1.4);

    const focusRule = g
      .append("line")
      .attr("y1", 0)
      .attr("y2", innerH)
      .attr("stroke", CHART_THEME.semantic.focus)
      .attr("stroke-dasharray", "4 4")
      .attr("stroke-width", 1)
      .attr("opacity", 0);

    const focusDot = g
      .append("circle")
      .attr("r", 4.3)
      .attr("fill", CHART_THEME.palette.weight)
      .attr("stroke", CHART_THEME.palette.contrastStroke)
      .attr("stroke-width", 2)
      .attr("opacity", 0);

    const bisect = d3.bisector((d) => d.date).left;
    const tooltip = createTooltip(root);

    function pickNearestByDate(targetDate) {
      const idx = bisect(parsed, targetDate);
      const left = parsed[Math.max(0, idx - 1)];
      const right = parsed[Math.min(parsed.length - 1, idx)];
      return !left ? right : !right ? left : targetDate - left.date > right.date - targetDate ? right : left;
    }

    function showPoint(point, tooltipX = null, tooltipY = null) {
      if (!point) return;
      const px = x(point.date);
      const py = y(point.weight);
      focusRule.attr("x1", px).attr("x2", px).attr("opacity", 1);
      focusDot.attr("cx", px).attr("cy", py).attr("opacity", 1);
      if (tooltipX !== null && tooltipY !== null) {
        tooltip?.show(tooltipHtml(point), tooltipX + margin.left + 12, tooltipY + margin.top - 20);
      }
    }

    function showNearest(clientX, clientY, localX, source = "weight") {
      const hoveredDate = x.invert(localX);
      const point = pickNearestByDate(hoveredDate);
      if (!point) return;
      showPoint(point, clientX, clientY);
      if (options.state) {
        options.state.setSelectedDate(point.dateKey, source);
      }
    }

    function clearFocus() {
      focusRule.attr("opacity", 0);
      focusDot.attr("opacity", 0);
      tooltip?.hide();
    }

    g.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .on("mousemove", (event) => {
        const { x: lx, y: ly } = normalizePointer(event, g.node());
        showNearest(lx, ly, lx, "weight");
      })
      .on("mouseleave", clearFocus)
      .on("click", (event) => {
        const { x: lx, y: ly } = normalizePointer(event, g.node());
        showNearest(lx, ly, lx, "weight");
      });

    const last = parsed[parsed.length - 1];
    const weekly = payload?.meta?.latest_weekly_diff_kg ?? last?.weekly;
    const weeklyText = weekly === null || weekly === undefined || Number.isNaN(Number(weekly))
      ? "7-day: n/a"
      : `7-day: ${Number(weekly) > 0 ? "+" : ""}${Number(weekly).toFixed(2)} kg`;

    g.append("text")
      .attr("x", 0)
      .attr("y", 10)
      .attr("text-anchor", "start")
      .attr("font-size", CHART_THEME.typography.label)
      .attr("fill", CHART_THEME.palette.textMuted)
      .text("Weight (kg)");

    g.append("text")
      .attr("x", innerW)
      .attr("y", innerH + 28)
      .attr("text-anchor", "end")
      .attr("font-size", CHART_THEME.typography.label)
      .attr("fill", CHART_THEME.palette.textMuted)
      .text("Date");

    g.append("text")
      .attr("x", innerW - 2)
      .attr("y", 12)
      .attr("text-anchor", "end")
      .attr("font-size", CHART_THEME.typography.annotation)
      .attr("font-weight", 700)
      .attr("fill", CHART_THEME.semantic.focus)
      .text(weeklyText);

    let unsubscribe = null;
    if (options.state && typeof options.state.subscribe === "function") {
      const current = options.state.get?.();
      if (current?.selectedDate) {
        const selectedDate = new Date(current.selectedDate);
        if (!Number.isNaN(selectedDate.getTime())) {
          showPoint(pickNearestByDate(selectedDate));
        }
      }

      unsubscribe = options.state.subscribe((next, change) => {
        if (change?.type !== "selectedDate") return;
        if (change?.source === "weight") return;
        const selectedDate = new Date(next.selectedDate || "");
        if (Number.isNaN(selectedDate.getTime())) return;
        showPoint(pickNearestByDate(selectedDate));
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
      tooltip?.destroy?.();
    };
  });
}

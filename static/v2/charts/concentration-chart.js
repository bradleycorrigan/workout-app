import { createChartFrame, applyTheme, renderEmptyState, withChartTiming } from "../chart-core.js";
import { renderXAxis, renderYAxis } from "../chart-axes.js";
import { CHART_THEME } from "../chart-theme.js";
import { createTooltip, normalizePointer, transitionIfAllowed } from "../chart-interactions.js";
import { drawSharedShadedLine } from "./shared-line-style.js";

const d3 = window.d3;

function parseConcentrationPoints(points) {
  return (points || [])
    .map((d) => ({
      date: new Date(d.date),
      dateKey: String(d.date),
      value: Number(d.estimated_concentration),
    }))
    .filter((d) => !Number.isNaN(d.value))
    .sort((a, b) => a.date - b.date);
}

function parseInjections(injections) {
  return (injections || [])
    .map((d) => ({
      date: new Date(d.date),
      dateKey: String(d.date),
      doseMg: Number(d.dose_mg),
      value: Number(d.estimated_concentration),
    }))
    .filter((d) => !Number.isNaN(d.value))
    .sort((a, b) => a.date - b.date);
}

function describePoint(point, injectionMap) {
  const dose = injectionMap.get(point.dateKey);
  const date = d3.timeFormat("%d %b %Y")(point.date);
  const concentration = point.value.toFixed(2);
  if (dose === undefined) {
    return `<strong>${date}</strong><br>Estimated level: ${concentration}`;
  }
  return `<strong>${date}</strong><br>Estimated level: ${concentration}<br>Injection: ${dose.toFixed(1)} mg`;
}

function currentDatePoint(points) {
  if (!points.length) return null;

  const todayKey = d3.timeFormat("%Y-%m-%d")(new Date());
  const exact = points.find((p) => p.dateKey === todayKey);
  if (exact) return exact;

  const today = new Date(todayKey);
  const prior = points.filter((p) => p.date <= today);
  if (prior.length) return prior[prior.length - 1];

  return points[0];
}

export function renderConcentrationChart(rootId, payload = {}, options = {}) {
  const root = document.getElementById(rootId);
  if (!root) return undefined;

  return withChartTiming(`concentration:${rootId}`, () => {
    const frame = createChartFrame(root);
    applyTheme(frame.svg);

    const parsed = parseConcentrationPoints(payload.points || []);
    const injections = parseInjections(payload.injections || []);

    if (!parsed.length) {
      renderEmptyState(frame);
      return;
    }

    const { svg, width, height } = frame;
    const margin = { top: 16, right: 22, bottom: 34, left: 50 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const x = d3.scaleTime().domain(d3.extent(parsed, (d) => d.date)).range([0, innerW]);
    const minY = d3.min(parsed, (d) => d.value) ?? 0;
    const maxY = d3.max(parsed, (d) => d.value) ?? 1;
    const pad = Math.max(0.6, (maxY - minY) * 0.12);
    const y = d3.scaleLinear().domain([Math.max(0, minY - pad), maxY + pad]).nice().range([innerH, 0]);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    renderYAxis(g, y, innerW);
    renderXAxis(g, x, innerH);

    drawSharedShadedLine({
      svg,
      g,
      points: parsed,
      x,
      y,
      value: (d) => d.value,
      color: CHART_THEME.palette.concentration,
      gradientPrefix: "conc-gradient",
      baselineY: innerH,
    });

    if (injections.length) {
      g.selectAll(".inj-pin")
        .data(injections)
        .join("line")
        .attr("class", "inj-pin")
        .attr("x1", (d) => x(d.date))
        .attr("x2", (d) => x(d.date))
        .attr("y1", innerH)
        .attr("y2", (d) => y(d.value))
        .attr("stroke", CHART_THEME.semantic.caution)
        .attr("stroke-opacity", 0.34)
        .attr("stroke-width", 1);

      g.selectAll(".inj-dot")
        .data(injections)
        .join("circle")
        .attr("class", "inj-dot")
        .attr("cx", (d) => x(d.date))
        .attr("cy", (d) => y(d.value))
        .attr("r", 4)
        .attr("fill", CHART_THEME.semantic.caution)
        .attr("stroke", CHART_THEME.palette.contrastStroke)
        .attr("stroke-width", 1.5);
    }

    const injectionMap = new Map();
    injections.forEach((inj) => {
      const prev = injectionMap.get(inj.dateKey) || 0;
      injectionMap.set(inj.dateKey, prev + (Number.isNaN(inj.doseMg) ? 0 : inj.doseMg));
    });

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
      .attr("r", 4.5)
      .attr("fill", CHART_THEME.palette.concentration)
      .attr("stroke", CHART_THEME.palette.contrastStroke)
      .attr("stroke-width", 2)
      .attr("opacity", 0);

    const tooltip = createTooltip(root);

    function pickNearestByDate(targetDate) {
      const bisectForDate = d3.bisector((d) => d.date).left;
      const idx = bisectForDate(parsed, targetDate);
      const left = parsed[Math.max(0, idx - 1)];
      const right = parsed[Math.min(parsed.length - 1, idx)];
      return !left ? right : !right ? left : targetDate - left.date > right.date - targetDate ? right : left;
    }

    function showPoint(point, tooltipX = null, tooltipY = null) {
      if (!point) return;
      const px = x(point.date);
      const py = y(point.value);
      focusRule.attr("x1", px).attr("x2", px).attr("opacity", 1);
      focusDot.attr("cx", px).attr("cy", py).attr("opacity", 1);
      if (tooltipX !== null && tooltipY !== null) {
        tooltip?.show(describePoint(point, injectionMap), tooltipX + margin.left + 12, tooltipY + margin.top - 20);
      }
    }

    function showNearest(clientX, clientY, localX, source = "concentration") {
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
        showNearest(lx, ly, lx, "concentration");
      })
      .on("mouseleave", clearFocus)
      .on("click", (event) => {
        const { x: lx, y: ly } = normalizePointer(event, g.node());
        showNearest(lx, ly, lx, "concentration");
      });

    g.append("text")
      .attr("x", 0)
      .attr("y", 10)
      .attr("text-anchor", "start")
      .attr("font-size", CHART_THEME.typography.label)
      .attr("fill", CHART_THEME.palette.textMuted)
      .text("Estimated level");

    g.append("text")
      .attr("x", innerW)
      .attr("y", innerH + 28)
      .attr("text-anchor", "end")
      .attr("font-size", CHART_THEME.typography.label)
      .attr("fill", CHART_THEME.palette.textMuted)
      .text("Date");

    const latest = currentDatePoint(parsed);
    const latestText = latest ? `Latest: ${latest.value.toFixed(2)}${injections.length ? ` | Injections: ${injections.length}` : ""}` : "";
    g.append("text")
      .attr("x", innerW - 2)
      .attr("y", 12)
      .attr("text-anchor", "end")
      .attr("font-size", CHART_THEME.typography.annotation)
      .attr("font-weight", 700)
      .attr("fill", CHART_THEME.semantic.focus)
      .text(latestText);

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
        if (change?.source === "concentration") return;
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

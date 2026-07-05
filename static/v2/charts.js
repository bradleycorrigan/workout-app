import { createChartFrame, applyTheme, renderEmptyState, withChartTiming, prefersReducedMotion } from "./chart-core.js";
import { renderXAxis, renderYAxis } from "./chart-axes.js";
import { CHART_THEME } from "./chart-theme.js";
import { renderConcentrationChart } from "./charts/concentration-chart.js";
import { renderWeightTrendChart } from "./charts/weight-chart.js";

const d3 = window.d3;

const MIX_COLORS = {
  gym: CHART_THEME.palette.mixGym,
  pool: CHART_THEME.palette.mixPool,
  lido: CHART_THEME.palette.mixLido,
};

const MIX_LABELS = {
  gym: "Gym",
  pool: "Pool Swim",
  lido: "Lido/Res Swim",
};

const WORKOUT_TYPE_LABELS = {
  gym: "Gym",
  gym_kgx: "Gym KGX",
  swim: "Pool Swim",
  swim_kgx: "Pool Swim KGX",
  lido_swim: "Lido Swim",
  reservoir: "Reservoir Swim",
  sauna: "Sauna",
};

export { renderConcentrationChart, renderWeightTrendChart };

function monthLabel(value) {
  const parsedMonth = d3.timeParse("%Y-%m")(String(value));
  return parsedMonth ? d3.timeFormat("%b %Y")(parsedMonth) : String(value);
}

function bucketKeyFromWorkoutType(workoutType) {
  if (workoutType === "gym" || workoutType === "gym_kgx") return "gym";
  if (workoutType === "swim" || workoutType === "swim_kgx") return "pool";
  return "lido";
}

function distributionFromHeatmap(cells, monthKey, cutoffDay) {
  const buckets = { gym: 0, pool: 0, lido: 0 };
  let totalSessions = 0;
  let selectedDaySessions = 0;
  let sessionsBeforeSelectedDay = 0;
  let activeDays = 0;
  for (const cell of cells || []) {
    if (String(cell.month) !== String(monthKey)) continue;
    const day = Number(cell.day || 0);
    if (!day || day > cutoffDay) continue;
    const sessionCount = Number(cell.count || 0);
    totalSessions += sessionCount;
    if (sessionCount > 0) {
      activeDays += 1;
      if (day < cutoffDay) sessionsBeforeSelectedDay += sessionCount;
      if (day === cutoffDay) selectedDaySessions += sessionCount;
    }
    const typeCounts = cell.workout_types || {};
    for (const [workoutType, rawCount] of Object.entries(typeCounts)) {
      const count = Number(rawCount || 0);
      if (!count) continue;
      buckets[bucketKeyFromWorkoutType(workoutType)] += count;
    }
  }

  const total = buckets.gym + buckets.pool + buckets.lido;
  if (!total) return null;
  return {
    gym: (buckets.gym / total) * 100,
    pool: (buckets.pool / total) * 100,
    lido: (buckets.lido / total) * 100,
    totalSessions,
    activeDays,
    selectedDaySessions,
    sessionsBeforeSelectedDay,
  };
}

function resolveMixFocus(parsed, selectedHeatmap = null, heatmapData = null) {
  const latest = parsed[parsed.length - 1];
  if (!selectedHeatmap) {
    return {
      focus: latest,
      contextText: `Full month view: ${monthLabel(latest.month)}`,
    };
  }

  const candidates = parsed.filter((p) => String(p.month) === String(selectedHeatmap.month));
  const focus = candidates.length ? candidates[candidates.length - 1] : latest;

  const cutoffDay = Number(selectedHeatmap.day || 0);
  if (!cutoffDay || !heatmapData?.cells?.length) {
    return {
      focus,
      contextText: `Full month view: ${monthLabel(focus.month)}`,
    };
  }

  const mtd = distributionFromHeatmap(heatmapData.cells, focus.month, cutoffDay);
  if (!mtd) {
    return {
      focus,
      contextText: `Full month view: ${monthLabel(focus.month)}`,
    };
  }

  let contextText = `Month-to-date day 1-${cutoffDay} (${monthLabel(focus.month)})`;
  if (mtd.totalSessions === 0) {
    contextText = `No sessions logged by day ${cutoffDay}`;
  } else if (mtd.activeDays === 1 && mtd.selectedDaySessions > 0 && mtd.sessionsBeforeSelectedDay === 0) {
    contextText = `Selected day only: ${monthLabel(focus.month)} day ${cutoffDay}`;
  }

  return {
    focus: { month: focus.month, ...mtd },
    contextText,
  };
}

function renderMixRadial(g, focusPoint, contextText, innerW, innerH) {
  const data = [
    { key: "gym", label: MIX_LABELS.gym, value: Number(focusPoint.gym) },
    { key: "pool", label: MIX_LABELS.pool, value: Number(focusPoint.pool) },
    { key: "lido", label: MIX_LABELS.lido, value: Number(focusPoint.lido) },
  ];

  const radius = Math.min(innerW, innerH) / 2 - 12;
  const centerX = innerW / 2;
  const centerY = innerH / 2 + 10;

  const ringThickness = Math.max(16, Math.min(26, radius * 0.24));
  const innerRadius = radius - ringThickness;
  const pie = d3.pie().sort(null).padAngle(0.03).value((d) => Math.max(0.0001, d.value));
  const arc = d3
    .arc()
    .innerRadius(innerRadius)
    .outerRadius(radius)
    .cornerRadius(Math.min(14, ringThickness / 2))
    .padRadius(radius);
  const labelArc = d3.arc().innerRadius(radius + 16).outerRadius(radius + 16);

  const group = g.append("g").attr("transform", `translate(${centerX},${centerY})`);

  const arcs = group
    .selectAll("path")
    .data(pie(data))
    .join("path")
    .attr("d", arc)
    .attr("fill", (d) => MIX_COLORS[d.data.key])
    .attr("stroke", CHART_THEME.palette.surfaceStrong)
    .attr("stroke-width", 1.2)
    .attr("opacity", 0);
  if (prefersReducedMotion()) {
    arcs.attr("opacity", 1);
  } else {
    arcs.transition().duration(260).attr("opacity", 1);
  }

  group
    .selectAll("text.segment")
    .data(pie(data))
    .join("text")
    .attr("class", "segment")
    .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("font-weight", 700)
    .attr("fill", CHART_THEME.palette.textStrong)
    .attr("paint-order", "stroke")
    .attr("stroke", CHART_THEME.palette.surface)
    .attr("stroke-width", 2)
    .text((d) => (d.data.value >= 10 ? `${d.data.value.toFixed(0)}%` : ""));

  group
    .append("text")
    .attr("text-anchor", "middle")
    .attr("y", -3)
    .attr("font-size", 12)
    .attr("font-weight", 700)
    .attr("fill", CHART_THEME.semantic.focus)
    .text(monthLabel(focusPoint.month));

  group
    .append("text")
    .attr("text-anchor", "middle")
    .attr("y", 14)
    .attr("font-size", 10)
    .attr("fill", CHART_THEME.palette.textMuted)
    .text(contextText);
}

export function renderMixChart(points, options = {}) {
  const root = document.getElementById("mix-chart");
  if (!root) return;

  withChartTiming("mix", () => {
    const frame = createChartFrame(root, { ratio: 0.52, minHeight: 210 });
    applyTheme(frame.svg);

    const parsed = (points || []).map((d) => ({
      month: d.month,
      gym: Number(d.gym_pct),
      pool: Number(d.pool_swim_pct),
      lido: Number(d.lido_res_swim_pct),
    }));

    if (!parsed.length) {
      renderEmptyState(frame);
      return;
    }

    const selectedHeatmap = options.state?.get?.().selectedHeatmap || null;
    const { focus, contextText } = resolveMixFocus(parsed, selectedHeatmap, options.heatmap || null);

    const { svg, width, height } = frame;
    const margin = { top: 12, right: 32, bottom: 36, left: 48 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    renderMixRadial(g, focus, contextText, innerW, innerH);
  });
}

function heatmapDetailHtml(month, day, item) {
  const count = Number(item?.count || 0);
  const label = String(item?.label || "No workouts");
  const value = Number(item?.value_gbp || 0);
  const types = item?.workout_types || {};
  const typeEntries = Object.entries(types)
    .map(([key, v]) => ({
      key,
      label: WORKOUT_TYPE_LABELS[key] || key.replaceAll("_", " "),
      count: Number(v || 0),
    }))
    .sort((a, b) => b.count - a.count);

  const typeChips = typeEntries.length
    ? typeEntries
        .map((t) => `<span class="heatmap-chip">${t.label}: ${t.count}</span>`)
        .join("")
    : '<span class="heatmap-chip">No type breakdown</span>';

  return `
    <p class="heatmap-detail-title">Selected Day</p>
    <div class="heatmap-chip-row">
      <span class="heatmap-chip selected">${monthLabel(month)} day ${day}</span>
      <span class="heatmap-chip">${count} session${count === 1 ? "" : "s"}</span>
      <span class="heatmap-chip">£${value.toFixed(2)}</span>
    </div>
    <p class="heatmap-meta-line">${label}</p>
    <div class="heatmap-chip-row">${typeChips}</div>
  `;
}

export function renderHeatmapChart(data, options = {}) {
  const root = document.getElementById("heatmap-chart");
  if (!root) return;

  withChartTiming("heatmap", () => {
    const months = data.months || [];
    const days = data.days || [];
    const cells = data.cells || [];
    const detailEl = document.getElementById("heatmap-detail");
    const stateSnapshot = options.state?.get?.() || {};
    const selectedMonths = stateSnapshot.selectedMonths || [];

    const visibleMonths = selectedMonths.length ? months.filter((m) => selectedMonths.includes(m)) : months;
    const visibleSet = new Set(visibleMonths);
    const visibleCells = cells.filter((c) => visibleSet.has(c.month));

    const dayCount = days.length || 31;
    const minHeight = Math.max(340, Math.floor(dayCount * 10.8) + 64);
    const frame = createChartFrame(root, { ratio: 0.72, minHeight });
    applyTheme(frame.svg);

    if (!visibleMonths.length || !visibleCells.length) {
      if (detailEl) detailEl.textContent = "No day-level data for selected filters.";
      renderEmptyState(frame);
      return;
    }

    if (detailEl) {
      detailEl.textContent = "Tap a day to inspect sessions and value.";
    }

    const { svg, width, height } = frame;
    const margin = { top: 8, right: 16, bottom: 28, left: 34 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const grouped = new Map();
    const cellRectLookup = new Map();
    visibleCells.forEach((c) => grouped.set(`${c.month}-${c.day}`, c));

    const maxCount = d3.max(visibleCells, (d) => Number(d.count)) || 1;
    const color = d3.scaleLinear().domain([0, maxCount]).range([CHART_THEME.semantic.neutralSoft, CHART_THEME.palette.heatmapHigh]);

    const x = d3.scaleBand().domain(visibleMonths).range([0, innerW]).paddingInner(0.08);
    const y = d3
      .scaleBand()
      .domain(days.map(String))
      .range([0, innerH])
      .paddingInner(0.03)
      .paddingOuter(0.02);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    let activeCell = null;
    function selectCell(rect, month, day, item) {
      if (!item) return;
      if (activeCell) activeCell.attr("stroke", "rgba(44, 72, 66, 0.08)").attr("stroke-width", 1);
      activeCell = rect;
      activeCell.attr("stroke", CHART_THEME.semantic.focus).attr("stroke-width", 1.8);
      if (detailEl) detailEl.innerHTML = heatmapDetailHtml(month, day, item);
    }

    visibleMonths.forEach((month) => {
      days.forEach((day) => {
        const item = grouped.get(`${month}-${day}`);
        const count = item ? Number(item.count) : 0;
        const label = item ? String(item.label || "") : "";

        const rect = g
          .append("rect")
          .attr("x", x(month))
          .attr("y", y(String(day)))
          .attr("width", x.bandwidth())
          .attr("height", y.bandwidth())
          .attr("rx", CHART_THEME.spacing.radiusSm)
          .attr("fill", color(count))
          .attr("stroke", "rgba(44, 72, 66, 0.08)")
          .attr("stroke-width", 1)
          .attr("tabindex", item ? 0 : -1)
          .attr("role", item ? "button" : null)
          .attr("aria-label", item ? `${month} ${day}, ${count} sessions` : null)
          .style("cursor", item ? "pointer" : "default");
        if (item) {
          cellRectLookup.set(`${month}-${day}`, rect);
        }

        rect.append("title").text(`${month} ${day}: ${label || "No workout"} (${count})`);

        if (item) {
          const onSelect = () => {
            selectCell(rect, month, day, item);
            options.state?.setSelectedHeatmap?.(
              {
                month,
                day,
                count: Number(item.count || 0),
                value_gbp: Number(item.value_gbp || 0),
              },
              "heatmap"
            );
          };

          rect.on("click", () => {
            onSelect();
          });

          rect.on("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect();
            }
          });

        }

        if (label && count > 0 && x.bandwidth() > 48 && y.bandwidth() > 11) {
          g.append("text")
            .attr("x", x(month) + x.bandwidth() / 2)
            .attr("y", y(String(day)) + y.bandwidth() / 2 + 3)
            .attr("text-anchor", "middle")
            .attr("font-size", 8)
            .attr("fill", CHART_THEME.palette.detailText)
            .text(label.length > 11 ? `${label.slice(0, 10)}.` : label);
        }
      });
    });

    const xAxis = renderXAxis(g, x, innerH, {
      tickSize: 0,
      tickFormat: (d) => {
        const parsed = d3.timeParse("%Y-%m")(String(d));
        return parsed ? d3.timeFormat("%b")(parsed) : String(d);
      },
    });
    const ticks = xAxis.selectAll(".tick text");
    ticks.each(function (_, i) {
      if (i === 0) d3.select(this).attr("text-anchor", "start");
      if (i === ticks.size() - 1) d3.select(this).attr("text-anchor", "end");
    });

    g.append("g")
      .call(d3.axisLeft(y).tickValues(days.filter((d) => d % 2 === 1).map(String)).tickSize(0))
      .call((axis) => axis.selectAll("path").attr("stroke", CHART_THEME.palette.axis))
      .call((axis) =>
        axis.selectAll("text").attr("fill", CHART_THEME.palette.text).attr("font-size", CHART_THEME.typography.axis)
      );

    const selectedHeatmap = stateSnapshot.selectedHeatmap;
    if (selectedHeatmap) {
      const item = grouped.get(`${selectedHeatmap.month}-${selectedHeatmap.day}`);
      const rect = cellRectLookup.get(`${selectedHeatmap.month}-${selectedHeatmap.day}`);
      if (rect && item) {
        selectCell(rect, selectedHeatmap.month, selectedHeatmap.day, item);
      }
    }
  });
}

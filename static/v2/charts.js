import { createChartFrame, applyTheme, renderEmptyState, withChartTiming } from "./chart-core.js";
import { renderXAxis, renderYAxis } from "./chart-axes.js";
import { CHART_THEME } from "./chart-theme.js";

const d3 = window.d3;

export function renderLineChart(rootId, points, opts) {
  const root = document.getElementById(rootId);
  if (!root) return;

  withChartTiming(`line:${rootId}`, () => {
    const frame = createChartFrame(root);
    applyTheme(frame.svg);

    if (!points || !points.length) {
      renderEmptyState(frame);
      return;
    }

    const { svg, width, height } = frame;
    const margin = { top: 16, right: 20, bottom: 34, left: 48 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const parsed = points.map((d) => ({
      x: new Date(d[opts.xKey]),
      y: Number(d[opts.yKey]),
    }));

    const x = d3.scaleTime().domain(d3.extent(parsed, (d) => d.x)).range([0, innerW]);
    const y = d3.scaleLinear().domain(d3.extent(parsed, (d) => d.y)).nice().range([innerH, 0]);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    renderYAxis(g, y, innerW);
    renderXAxis(g, x, innerH);

    const area = d3
      .area()
      .x((d) => x(d.x))
      .y0(innerH)
      .y1((d) => y(d.y))
      .curve(d3.curveCatmullRom.alpha(0.45));

    const line = d3
      .line()
      .x((d) => x(d.x))
      .y((d) => y(d.y))
      .curve(d3.curveCatmullRom.alpha(0.45));

    const areaFill = d3.color(opts.color).copy({ opacity: 0.14 });

    g.append("path").datum(parsed).attr("fill", areaFill).attr("d", area);
    g.append("path").datum(parsed).attr("fill", "none").attr("stroke", opts.color).attr("stroke-width", 3).attr("d", line);

    if (opts.markers && opts.markers.length) {
      const markerPoints = opts.markers
        .map((m) => ({ x: new Date(m.date), y: Number(m.estimated_concentration) }))
        .filter((m) => !Number.isNaN(m.y));

      g.selectAll(".marker-dot")
        .data(markerPoints)
        .join("circle")
        .attr("class", "marker-dot")
        .attr("cx", (d) => x(d.x))
        .attr("cy", (d) => y(d.y))
        .attr("r", CHART_THEME.spacing.radiusMd)
        .attr("fill", CHART_THEME.semantic.caution)
        .attr("stroke", "#fff4f4")
        .attr("stroke-width", 1.5);
    }

    if (opts.yLabel) {
      g.append("text")
        .attr("x", 0)
        .attr("y", 10)
        .attr("text-anchor", "start")
        .attr("font-size", CHART_THEME.typography.label)
        .attr("fill", CHART_THEME.palette.textMuted)
        .text(opts.yLabel);
    }

    if (opts.xLabel) {
      g.append("text")
        .attr("x", innerW)
        .attr("y", innerH + 28)
        .attr("text-anchor", "end")
        .attr("font-size", CHART_THEME.typography.label)
        .attr("fill", CHART_THEME.palette.textMuted)
        .text(opts.xLabel);
    }

    if (opts.annotation) {
      g.append("text")
        .attr("x", innerW - 2)
        .attr("y", 12)
        .attr("text-anchor", "end")
        .attr("font-size", CHART_THEME.typography.annotation)
        .attr("font-weight", 700)
        .attr("fill", CHART_THEME.semantic.focus)
        .text(opts.annotation);
    }
  });
}

export function renderMixChart(points) {
  const root = document.getElementById("mix-chart");
  if (!root) return;

  withChartTiming("mix", () => {
    const frame = createChartFrame(root);
    applyTheme(frame.svg);

    if (!points || !points.length) {
      renderEmptyState(frame);
      return;
    }

    const { svg, width, height } = frame;
    const margin = { top: 10, right: 14, bottom: 34, left: 44 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const parsed = points.map((d) => ({
      month: d.month,
      gym: Number(d.gym_pct),
      pool: Number(d.pool_swim_pct),
      lido: Number(d.lido_res_swim_pct),
    }));

    const keys = ["gym", "pool", "lido"];
    const colors = {
      gym: CHART_THEME.palette.mixGym,
      pool: CHART_THEME.palette.mixPool,
      lido: CHART_THEME.palette.mixLido,
    };
    const stacked = d3.stack().keys(keys)(parsed);

    const x = d3.scalePoint().domain(parsed.map((d) => d.month)).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    renderYAxis(g, y, innerW, { tickFormat: (d) => `${d}%` });
    renderXAxis(g, x, innerH, { tickSize: 0 });

    const area = d3
      .area()
      .x((d) => x(d.data.month))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveMonotoneX);

    g.selectAll(".layer")
      .data(stacked)
      .join("path")
      .attr("fill", (d) => colors[d.key])
      .attr("opacity", 0.65)
      .attr("d", area);

    g.append("text")
      .attr("x", -6)
      .attr("y", -4)
      .attr("text-anchor", "start")
      .attr("font-size", CHART_THEME.typography.label)
      .attr("fill", CHART_THEME.palette.textMuted)
      .text("Share (%)");
  });
}

export function renderHeatmapChart(data) {
  const root = document.getElementById("heatmap-chart");
  if (!root) return;

  withChartTiming("heatmap", () => {
    const frame = createChartFrame(root);
    applyTheme(frame.svg);

    const months = data.months || [];
    const days = data.days || [];
    const cells = data.cells || [];

    if (!months.length || !cells.length) {
      renderEmptyState(frame);
      return;
    }

    const { svg, width, height } = frame;
    const margin = { top: 8, right: 10, bottom: 24, left: 34 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const grouped = new Map();
    cells.forEach((c) => grouped.set(`${c.month}-${c.day}`, c));

    const maxCount = d3.max(cells, (d) => Number(d.count)) || 1;
    const color = d3.scaleLinear().domain([0, maxCount]).range([CHART_THEME.semantic.neutralSoft, "#2e8f72"]);

    const x = d3.scaleBand().domain(months).range([0, innerW]).paddingInner(0.06);
    const y = d3.scaleBand().domain(days.map(String)).range([0, innerH]).paddingInner(0.08);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    months.forEach((month) => {
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
          .attr("fill", color(count));
        rect.append("title").text(`${month} ${day}: ${label || "No workout"} (${count})`);

        if (label && x.bandwidth() > 42 && y.bandwidth() > 11) {
          g.append("text")
            .attr("x", x(month) + x.bandwidth() / 2)
            .attr("y", y(String(day)) + y.bandwidth() / 2 + 3)
            .attr("text-anchor", "middle")
            .attr("font-size", 8)
            .attr("fill", "#10363f")
            .text(label.length > 11 ? `${label.slice(0, 10)}.` : label);
        }
      });
    });

    renderXAxis(g, x, innerH, { tickSize: 0 });

    g.append("g")
      .call(d3.axisLeft(y).tickValues(days.filter((d) => d % 2 === 1).map(String)).tickSize(0))
      .call((axis) => axis.selectAll("path").attr("stroke", CHART_THEME.palette.axis))
      .call((axis) =>
        axis.selectAll("text").attr("fill", CHART_THEME.palette.text).attr("font-size", CHART_THEME.typography.axis)
      );
  });
}

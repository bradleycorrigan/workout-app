import { loadInsights } from "./api.js";
import { renderConcentrationChart, renderHeatmapChart, renderMixChart, renderWeightTrendChart } from "./charts.js";
import { renderMonthlySummary } from "./history.js";
import { createInsightsState } from "./insights-state.js";
import { createChartRegistry } from "./chart-registry.js";

const statusEl = document.getElementById("status");
const monthPickerEl = document.getElementById("month-picker");
const monthPickerToggleEl = document.getElementById("month-picker-toggle");
const monthPickerMenuEl = document.getElementById("month-picker-menu");
const monthPickerOptionsEl = document.getElementById("month-picker-options");
const monthPickerClearEl = document.getElementById("month-picker-clear");
const monthPickerDoneEl = document.getElementById("month-picker-done");
const applyEl = document.getElementById("apply");
const themeToggleEl = document.getElementById("theme-toggle");
const mixResetEl = document.getElementById("mix-reset");
const metricWorkouts = document.getElementById("metric-workouts");
const metricWeigh = document.getElementById("metric-weigh");
const metricValue = document.getElementById("metric-value");
const metricWorkoutsLabel = document.getElementById("metric-workouts-label");
const metricWeighLabel = document.getElementById("metric-weigh-label");
const metricValueLabel = document.getElementById("metric-value-label");
const concSummaryEl = document.getElementById("conc-summary");
const weightSummaryEl = document.getElementById("weight-summary");
const heatmapSummaryEl = document.getElementById("heatmap-summary");
const mixSummaryEl = document.getElementById("mix-summary");

const d3 = window.d3;

const insightsState = createInsightsState();
const chartRegistry = createChartRegistry();

chartRegistry.register("concentration", (payload) => renderConcentrationChart("conc-chart", payload.conc || {}, { state: insightsState }));
chartRegistry.register("weight", (payload) => renderWeightTrendChart("weight-chart", payload.weight || {}, { state: insightsState }));
chartRegistry.register("mix", (payload) =>
  renderMixChart((payload.mix && payload.mix.points) || [], {
    state: insightsState,
    heatmap: payload.heatmap || null,
  })
);
chartRegistry.register("heatmap", (payload) => renderHeatmapChart(payload.heatmap || {}, { state: insightsState }));

let latestInsights = null;
let availableMonths = [];
let selectedMonthDraft = [];

function filters() {
  return {
    months: [...selectedMonthDraft],
  };
}

function monthKey(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(String(value))) return String(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function formatMonth(ym) {
  const parsed = d3.timeParse("%Y-%m")(String(ym));
  return parsed ? d3.timeFormat("%b %Y")(parsed) : String(ym);
}

function monthsWindowLabel(months) {
  if (!months || !months.length) return "All months";
  if (months.length === 1) return formatMonth(months[0]);
  return `${formatMonth(months[0])} to ${formatMonth(months[months.length - 1])}`;
}

function currentMonthKey() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function shiftMonth(ym, delta) {
  const [y, m] = String(ym).split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

function defaultMonthSelection(months) {
  if (!months || !months.length) return [];
  const current = currentMonthKey();
  const monthSet = new Set(months);
  const desired = [0, -1, -2].map((offset) => shiftMonth(current, offset));
  const picked = desired.filter((ym) => monthSet.has(ym)).sort();
  if (picked.length) return picked;
  return months.slice(-3);
}

function updateMonthPickerLabel(selected) {
  if (!monthPickerToggleEl) return;
  if (!selected.length) {
    monthPickerToggleEl.textContent = "Default chart window (3 months)";
    return;
  }
  if (selected.length === 1) {
    monthPickerToggleEl.textContent = formatMonth(selected[0]);
    return;
  }
  monthPickerToggleEl.textContent = `${selected.length} months selected`;
}

function setMonthPickerOpen(open) {
  if (!monthPickerMenuEl || !monthPickerToggleEl) return;
  monthPickerMenuEl.hidden = !open;
  monthPickerToggleEl.setAttribute("aria-expanded", open ? "true" : "false");
}

function selectedMonthsFromCheckboxes() {
  if (!monthPickerOptionsEl) return [];
  return Array.from(monthPickerOptionsEl.querySelectorAll('input[type="checkbox"]:checked'))
    .map((el) => String(el.value))
    .sort();
}

function populateMonthOptions(months, selected) {
  if (!monthPickerOptionsEl) return;
  const selectedSet = new Set(selected || []);
  monthPickerOptionsEl.innerHTML = "";
  months.forEach((ym) => {
    const label = document.createElement("label");
    label.className = "month-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = ym;
    input.checked = selectedSet.has(ym);
    input.addEventListener("change", () => {
      selectedMonthDraft = selectedMonthsFromCheckboxes();
      updateMonthPickerLabel(selectedMonthDraft.length ? selectedMonthDraft : defaultMonthSelection(availableMonths));
    });

    const text = document.createElement("span");
    text.textContent = formatMonth(ym);
    label.appendChild(input);
    label.appendChild(text);
    monthPickerOptionsEl.appendChild(label);
  });
  selectedMonthDraft = selectedMonthsFromCheckboxes();
  updateMonthPickerLabel(selectedMonthDraft.length ? selectedMonthDraft : defaultMonthSelection(months));
}

function inferAvailableMonths(payload) {
  const months = new Set();
  (payload?.mix?.points || []).forEach((p) => p?.month && months.add(String(p.month)));
  (payload?.summary?.rows || []).forEach((r) => r?.month && months.add(String(r.month)));
  (payload?.heatmap?.months || []).forEach((m) => m && months.add(String(m)));
  (payload?.conc?.points || []).forEach((p) => {
    const mk = monthKey(p?.date);
    if (mk) months.add(mk);
  });
  (payload?.weight?.points || []).forEach((p) => {
    const mk = monthKey(p?.date);
    if (mk) months.add(mk);
  });
  return Array.from(months).sort();
}

function applyMonthFilter(payload, selectedMonths) {
  if (!selectedMonths || !selectedMonths.length) return payload;
  const selected = new Set(selectedMonths);

  const filterByDate = (rows) => (rows || []).filter((r) => selected.has(monthKey(r?.date)));
  const filteredHeatmapCells = (payload?.heatmap?.cells || []).filter((c) => selected.has(String(c.month)));

  return {
    ...payload,
    conc: {
      ...(payload?.conc || {}),
      points: filterByDate(payload?.conc?.points),
      injections: filterByDate(payload?.conc?.injections),
    },
    weight: {
      ...(payload?.weight || {}),
      points: filterByDate(payload?.weight?.points),
    },
    mix: {
      ...(payload?.mix || {}),
      points: (payload?.mix?.points || []).filter((p) => selected.has(String(p.month))),
    },
    heatmap: {
      ...(payload?.heatmap || {}),
      months: (payload?.heatmap?.months || []).filter((m) => selected.has(String(m))),
      cells: filteredHeatmapCells,
    },
    summary: {
      ...(payload?.summary || {}),
      rows: (payload?.summary?.rows || []).filter((r) => selected.has(String(r.month))),
    },
  };
}

function currentOrPriorPoint(points, valueKey) {
  if (!points || !points.length) return null;
  const today = new Date();
  const sorted = [...points]
    .map((p) => ({ ...p, _date: new Date(p.date) }))
    .filter((p) => !Number.isNaN(p._date.getTime()))
    .sort((a, b) => a._date - b._date);
  if (!sorted.length) return null;

  const prior = sorted.filter((p) => p._date <= today);
  const active = prior.length ? prior[prior.length - 1] : sorted[0];
  return {
    point: active,
    value: Number(active[valueKey] || 0),
    index: sorted.findIndex((p) => p.date === active.date),
    sorted,
  };
}

function renderTopMetrics(payload) {
  const dashboard = payload?.dashboard || {};
  const monthLabel = String(dashboard.month_label || "Current month").toUpperCase();

  if (metricWorkouts) metricWorkouts.textContent = String(dashboard.month_workouts ?? 0);
  if (metricWeigh) metricWeigh.textContent = String(dashboard.month_weigh_ins ?? 0);
  if (metricValue) metricValue.textContent = Number(dashboard.month_value_gbp ?? 0).toFixed(2);

  if (metricWorkoutsLabel) metricWorkoutsLabel.textContent = `💪 Workouts (${monthLabel})`;
  if (metricWeighLabel) metricWeighLabel.textContent = `⚖️ Weigh-ins (${monthLabel})`;
  if (metricValueLabel) metricValueLabel.textContent = `💷 Workout Value GBP (${monthLabel})`;
}

function renderNarrativeSummaries(payload, windowLabel) {
  const concPoints = payload?.conc?.points || [];
  const concInjections = payload?.conc?.injections || [];
  if (concSummaryEl) {
    if (!concPoints.length) {
      concSummaryEl.textContent = "No concentration data for the selected range.";
    } else {
      const current = currentOrPriorPoint(concPoints, "estimated_concentration");
      const currentDate = current ? d3.timeFormat("%d %b %Y")(new Date(current.point.date)) : "today";
      concSummaryEl.textContent = `As of ${currentDate}, estimate is ${current ? current.value.toFixed(2) : "0.00"} with ${concInjections.length} injections in ${windowLabel}.`;
    }
  }

  const weightPoints = payload?.weight?.points || [];
  if (weightSummaryEl) {
    if (!weightPoints.length) {
      weightSummaryEl.textContent = "No weight entries for the selected range.";
    } else {
      const current = currentOrPriorPoint(weightPoints, "weight_kg");
      const prev = current && current.index > 0 ? current.sorted[current.index - 1] : null;
      const diff = prev ? current.value - Number(prev.weight_kg || 0) : 0;
      const diffText = prev ? `${diff > 0 ? "+" : ""}${diff.toFixed(2)} kg since previous log.` : "First entry in range.";
      const currentDate = current ? d3.timeFormat("%d %b %Y")(new Date(current.point.date)) : "today";
      weightSummaryEl.textContent = `As of ${currentDate}, weight is ${current ? current.value.toFixed(2) : "0.00"} kg in ${windowLabel}. ${diffText}`;
    }
  }

  const heatmapCells = payload?.heatmap?.cells || [];
  if (heatmapSummaryEl) {
    if (!heatmapCells.length) {
      heatmapSummaryEl.textContent = "No workout days in this range.";
    } else {
      const activeDays = heatmapCells.length;
      const totalSessions = heatmapCells.reduce((sum, c) => sum + Number(c.count || 0), 0);
      heatmapSummaryEl.textContent = `${activeDays} active days and ${totalSessions} total sessions in ${windowLabel}.`;
    }
  }

  if (mixSummaryEl) {
    const selected = insightsState.get().selectedHeatmap;
    if (selected) {
      const selectedMonth = String(selected.month);
      const selectedDay = Number(selected.day || 0);
      const monthCells = (payload?.heatmap?.cells || []).filter(
        (c) => String(c.month) === selectedMonth && Number(c.day || 0) <= selectedDay,
      );
      const totalSessions = monthCells.reduce((sum, c) => sum + Number(c.count || 0), 0);
      const activeDays = monthCells.filter((c) => Number(c.count || 0) > 0).length;
      const selectedDayCell = monthCells.find((c) => Number(c.day || 0) === selectedDay);
      const selectedDaySessions = Number(selectedDayCell?.count || 0);
      const sessionsBeforeSelectedDay = monthCells
        .filter((c) => Number(c.day || 0) < selectedDay)
        .reduce((sum, c) => sum + Number(c.count || 0), 0);

      if (totalSessions === 0) {
        mixSummaryEl.textContent = `Mix is showing ${formatMonth(selected.month)} day ${selected.day} (no sessions logged up to that day).`;
      } else if (activeDays === 1 && selectedDaySessions > 0 && sessionsBeforeSelectedDay === 0) {
        mixSummaryEl.textContent = `Mix is showing selected day only: ${formatMonth(selected.month)} day ${selected.day}.`;
      } else {
        mixSummaryEl.textContent = `Mix is showing month-to-date day 1-${selected.day} in ${formatMonth(selected.month)} (${totalSessions} sessions across ${activeDays} active days).`;
      }
    } else {
      const cells = payload?.heatmap?.cells || [];
      if (!cells.length) {
        mixSummaryEl.textContent = `No mix data in ${windowLabel}.`;
      } else {
        const totalSessions = cells.reduce((sum, c) => sum + Number(c.count || 0), 0);
        const activeDays = cells.filter((c) => Number(c.count || 0) > 0).length;
        mixSummaryEl.textContent = `Mix is showing selected window (${windowLabel}): ${totalSessions} sessions across ${activeDays} active days.`;
      }
    }
  }
}

function renderFromPayload(payload) {
  if (!payload) return;
  const selectedMonths = insightsState.get().selectedMonths || [];
  const windowLabel = monthsWindowLabel(selectedMonths.length ? selectedMonths : availableMonths);

  const filteredPayload = applyMonthFilter(payload, selectedMonths);

  chartRegistry.renderAll(filteredPayload, insightsState.get());
  renderMonthlySummary((filteredPayload.summary && filteredPayload.summary.rows) || []);
  renderTopMetrics(payload);
  renderNarrativeSummaries(filteredPayload, windowLabel);

  if (mixResetEl) {
    mixResetEl.hidden = !insightsState.get().selectedHeatmap;
  }
}

async function reload() {
  if (!statusEl) return;
  statusEl.textContent = "Loading insights...";
  try {
    latestInsights = await loadInsights({});
    availableMonths = inferAvailableMonths(latestInsights);

    const chosenMonths = filters().months;
    const nextMonths = chosenMonths.length ? chosenMonths : defaultMonthSelection(availableMonths);
    insightsState.setSelectedMonths(nextMonths);
    populateMonthOptions(availableMonths, nextMonths);
    selectedMonthDraft = [...nextMonths];
    insightsState.setSelectedHeatmap(null, "filters");
    renderFromPayload(latestInsights);

    const failures = Object.keys(latestInsights?._errors || {});
    if (!failures.length) {
      statusEl.textContent = "Insights updated.";
    } else {
      statusEl.textContent = `Insights updated with partial data (${failures.length} source${failures.length === 1 ? "" : "s"} unavailable).`;
    }
  } catch (error) {
    statusEl.textContent = error?.message || "Could not load insights.";
  }
}

applyEl?.addEventListener("click", () => {
  const picked = selectedMonthsFromCheckboxes();
  const nextMonths = picked.length ? picked : defaultMonthSelection(availableMonths);
  selectedMonthDraft = [...nextMonths];
  populateMonthOptions(availableMonths, nextMonths);
  insightsState.setSelectedMonths(nextMonths);
  insightsState.setSelectedHeatmap(null, "filters");
  renderFromPayload(latestInsights);
  if (statusEl) statusEl.textContent = "Insights updated.";
});

monthPickerToggleEl?.addEventListener("click", () => {
  setMonthPickerOpen(monthPickerMenuEl?.hidden ?? true);
});

monthPickerDoneEl?.addEventListener("click", () => {
  selectedMonthDraft = selectedMonthsFromCheckboxes();
  setMonthPickerOpen(false);
});

monthPickerClearEl?.addEventListener("click", () => {
  if (!monthPickerOptionsEl) return;
  monthPickerOptionsEl.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    el.checked = false;
  });
  selectedMonthDraft = [];
  updateMonthPickerLabel(defaultMonthSelection(availableMonths));
});

document.addEventListener("click", (event) => {
  if (!monthPickerEl || monthPickerMenuEl?.hidden) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (!monthPickerEl.contains(target)) {
    setMonthPickerOpen(false);
  }
});

mixResetEl?.addEventListener("click", () => {
  insightsState.setSelectedHeatmap(null, "mix-reset");
  renderFromPayload(latestInsights);
  if (statusEl) statusEl.textContent = "Mix reset to full month.";
});

function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  window.localStorage.setItem("pulseboard-theme", mode);
  if (themeToggleEl) {
    themeToggleEl.textContent = mode === "dark" ? "☀️ Light" : "🌙 Dark";
    themeToggleEl.setAttribute("aria-label", mode === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }
  if (latestInsights) {
    renderFromPayload(latestInsights);
  }
}

function initTheme() {
  const stored = window.localStorage.getItem("pulseboard-theme");
  if (stored === "dark" || stored === "light") {
    applyTheme(stored);
    return;
  }
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

themeToggleEl?.addEventListener("click", () => {
  const mode = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(mode);
});

insightsState.subscribe((_, change) => {
  if (!latestInsights) return;
  if (change?.type === "selectedHeatmap" || change?.type === "selectedMonths") {
    renderFromPayload(latestInsights);
  }
});

let resizeTimer;

window.addEventListener(
  "resize",
  () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (latestInsights) {
        renderFromPayload(latestInsights);
        if (statusEl) statusEl.textContent = "Layout updated.";
      } else {
        void reload();
      }
    }, 180);
  },
  { passive: true }
);

window.addEventListener("beforeunload", () => {
  chartRegistry.destroy();
});

initTheme();
void reload();

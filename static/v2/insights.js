import { loadInsights } from "./api.js";
import { renderHeatmapChart, renderLineChart, renderMixChart } from "./charts.js";
import { renderMonthlySummary } from "./history.js";

const statusEl = document.getElementById("status");
const startEl = document.getElementById("start-date");
const endEl = document.getElementById("end-date");
const applyEl = document.getElementById("apply");
const metricWorkouts = document.getElementById("metric-workouts");
const metricWeigh = document.getElementById("metric-weigh");
const metricValue = document.getElementById("metric-value");
const metricWorkoutsLabel = document.getElementById("metric-workouts-label");
const metricWeighLabel = document.getElementById("metric-weigh-label");
const metricValueLabel = document.getElementById("metric-value-label");

function filters() {
  return {
    startDate: startEl?.value || "",
    endDate: endEl?.value || "",
  };
}

function weeklyDiffLabel(meta) {
  const val = meta?.latest_weekly_diff_kg;
  if (val === null || val === undefined) return "7-day change: n/a";
  const sign = Number(val) > 0 ? "+" : "";
  return `7-day change: ${sign}${Number(val).toFixed(1)} kg`;
}

function renderTopMetrics(dashboard) {
  if (!dashboard) return;
  if (metricWorkouts) metricWorkouts.textContent = String(dashboard.month_workouts ?? 0);
  if (metricWeigh) metricWeigh.textContent = String(dashboard.month_weigh_ins ?? 0);
  if (metricValue) metricValue.textContent = Number(dashboard.month_value_gbp ?? 0).toFixed(2);

  const monthLabel = String(dashboard.month_label || "").toUpperCase();
  if (metricWorkoutsLabel) metricWorkoutsLabel.textContent = `💪 Workouts (${monthLabel})`;
  if (metricWeighLabel) metricWeighLabel.textContent = `⚖️ Weigh-ins (${monthLabel})`;
  if (metricValueLabel) metricValueLabel.textContent = `💷 Workout Value GBP (${monthLabel})`;
}

async function reload() {
  if (!statusEl) return;
  statusEl.textContent = "Loading insights...";
  try {
    const { conc, weight, mix, heatmap, summary, dashboard } = await loadInsights(filters());

    renderLineChart("conc-chart", conc.points || [], {
      xKey: "date",
      yKey: "estimated_concentration",
      color: "#1f7a68",
      xLabel: "Date",
      yLabel: "Estimated level",
      markers: conc.injections || [],
      annotation: `${(conc.injections || []).length} injection marks`,
    });

    renderLineChart("weight-chart", weight.points || [], {
      xKey: "date",
      yKey: "weight_kg",
      color: "#1f3f7a",
      xLabel: "Date",
      yLabel: "Weight (kg)",
      annotation: weeklyDiffLabel(weight.meta),
    });

    renderMixChart(mix.points || []);
    renderHeatmapChart(heatmap || {});
    renderMonthlySummary(summary.rows || []);
    renderTopMetrics(dashboard || {});

    statusEl.textContent = "Insights updated.";
  } catch (error) {
    statusEl.textContent = error?.message || "Could not load insights.";
  }
}

applyEl?.addEventListener("click", () => {
  void reload();
});

let resizeTimer;
window.addEventListener(
  "resize",
  () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      void reload();
    }, 180);
  },
  { passive: true }
);

void reload();

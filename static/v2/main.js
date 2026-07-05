import { loadInsights, postEncoded, postForm } from "./api.js";
import { renderHeatmapChart, renderLineChart, renderMixChart } from "./charts.js";
import { renderHistory, renderMonthlySummary } from "./history.js";
import { CHART_THEME } from "./chart-theme.js";

const statusEl = document.getElementById("status");
const exerciseEl = document.getElementById("exercise");
const startEl = document.getElementById("start-date");
const endEl = document.getElementById("end-date");
const applyEl = document.getElementById("apply");
const weighForm = document.getElementById("weigh-form");
const injectionForm = document.getElementById("injection-form");
const workoutForm = document.getElementById("workout-form");
const metricWorkouts = document.getElementById("metric-workouts");
const metricWeigh = document.getElementById("metric-weigh");
const metricValue = document.getElementById("metric-value");
const metricWorkoutsLabel = document.getElementById("metric-workouts-label");
const metricWeighLabel = document.getElementById("metric-weigh-label");
const metricValueLabel = document.getElementById("metric-value-label");

function filters() {
  return {
    exercise: exerciseEl?.value || "all",
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
  statusEl.textContent = "Loading charts...";
  try {
    const { conc, weight, mix, heatmap, summary, history, dashboard } = await loadInsights(filters());

    renderLineChart("conc-chart", conc.points || [], {
      xKey: "date",
      yKey: "estimated_concentration",
      color: CHART_THEME.palette.concentration,
      xLabel: "Date",
      yLabel: "Estimated level",
      markers: conc.injections || [],
      annotation: `${(conc.injections || []).length} injection marks`,
    });

    renderLineChart("weight-chart", weight.points || [], {
      xKey: "date",
      yKey: "weight_kg",
      color: CHART_THEME.palette.weight,
      xLabel: "Date",
      yLabel: "Weight (kg)",
      annotation: weeklyDiffLabel(weight.meta),
    });

    renderMixChart(mix.points || []);
    renderHeatmapChart(heatmap || {});
    renderMonthlySummary(summary.rows || []);
    renderHistory(history || {});
    renderTopMetrics(dashboard || {});

    statusEl.textContent = "Live data loaded.";
  } catch (error) {
    statusEl.textContent = error?.message || "Could not load charts right now.";
  }
}

function parseNumberPrompt(label, initialValue) {
  const raw = window.prompt(label, String(initialValue ?? ""));
  if (raw === null) return null;
  const val = Number(raw);
  if (Number.isNaN(val)) throw new Error("Invalid number.");
  return val;
}

async function handleHistoryAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const kind = button.dataset.kind;
  const id = button.dataset.id;
  if (!action || !kind || !id) return;

  try {
    if (action === "delete") {
      const ok = window.confirm("Delete this entry?");
      if (!ok) return;
      const base = kind === "weigh" ? "/weigh-ins" : kind === "injection" ? "/injections" : "/workouts";
      await postEncoded(`${base}/${id}/delete`);
      statusEl.textContent = "Entry deleted.";
      await reload();
      return;
    }

    if (action === "edit") {
      if (kind === "weigh") {
        const weigh_date = window.prompt("Weigh date (YYYY-MM-DD)", button.dataset.date || "");
        if (weigh_date === null) return;
        const weight_kg = parseNumberPrompt("Weight (kg)", button.dataset.weight || "");
        if (weight_kg === null) return;
        await postEncoded(`/weigh-ins/${id}/edit`, { weigh_date, weight_kg: String(weight_kg) });
      } else if (kind === "injection") {
        const injection_date = window.prompt("Injection date (YYYY-MM-DD)", button.dataset.date || "");
        if (injection_date === null) return;
        const dose_mg = parseNumberPrompt("Dose (mg)", button.dataset.dose || "");
        if (dose_mg === null) return;
        await postEncoded(`/injections/${id}/edit`, { injection_date, dose_mg: String(dose_mg) });
      } else {
        const workout_date = window.prompt("Workout date (YYYY-MM-DD)", button.dataset.date || "");
        if (workout_date === null) return;
        const workout_type = window.prompt(
          "Workout type (gym, gym_kgx, swim, swim_kgx, lido_swim, reservoir, sauna)",
          button.dataset.workoutType || "gym"
        );
        if (workout_type === null) return;
        await postEncoded(`/workouts/${id}/edit`, { workout_date, workout_type });
      }
      statusEl.textContent = "Entry updated.";
      await reload();
    }
  } catch (error) {
    statusEl.textContent = error?.message || "Could not complete action.";
  }
}

function bindForms() {
  weighForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await postForm("/weigh-ins", weighForm);
      statusEl.textContent = "Saved weigh-in.";
      weighForm.reset();
      await reload();
    } catch (error) {
      statusEl.textContent = error?.message || "Could not save weigh-in.";
    }
  });

  injectionForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await postForm("/injections", injectionForm);
      statusEl.textContent = "Saved injection.";
      injectionForm.reset();
      await reload();
    } catch (error) {
      statusEl.textContent = error?.message || "Could not save injection.";
    }
  });

  workoutForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const checked = workoutForm.querySelectorAll('input[name="workout_types"]:checked').length;
    if (!checked) {
      statusEl.textContent = "Choose at least one workout type.";
      return;
    }
    try {
      await postForm("/workouts", workoutForm);
      statusEl.textContent = "Saved workout entries.";
      workoutForm.reset();
      await reload();
    } catch (error) {
      statusEl.textContent = error?.message || "Could not save workouts.";
    }
  });
}

function bindGlobalHandlers() {
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
      }, 160);
    },
    { passive: true }
  );

  document.addEventListener("click", (event) => {
    void handleHistoryAction(event);
  });
}

bindForms();
bindGlobalHandlers();
void reload();

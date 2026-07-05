import { loadHistory, postEncoded, postForm } from "./api.js";
import { renderHistoryByKind } from "./history.js";

const statusEl = document.getElementById("status");
const logKindEl = document.getElementById("log-kind");
const nextBtn = document.getElementById("log-next");
const dialogEl = document.getElementById("log-dialog");
const dialogForm = document.getElementById("dialog-form");
const dialogTitle = document.getElementById("dialog-title");
const dialogCancel = document.getElementById("dialog-cancel");
const dialogStep = document.getElementById("dialog-step");
const logPreview = document.getElementById("log-preview");
const historyTitle = document.getElementById("history-title");
const historySubtitle = document.getElementById("history-subtitle");

let historyCache = { weigh_ins: [], injections: [], workouts: [] };

const KIND_META = {
  weigh: {
    title: "⚖️ Weigh-In",
    historyTitle: "Recent Weigh-Ins",
    historySubtitle: "Showing your latest weigh-ins first.",
    preview: "You are about to log a weigh-in.",
  },
  injection: {
    title: "💉 Injection",
    historyTitle: "Recent Injections",
    historySubtitle: "Showing your latest injections first.",
    preview: "You are about to log an injection.",
  },
  workout: {
    title: "💪 Workout",
    historyTitle: "Recent Workouts",
    historySubtitle: "Showing your latest workouts first.",
    preview: "You are about to log workouts.",
  },
};

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function formMarkup(kind, mode = "create", seed = {}) {
  if (kind === "weigh") {
    const submitLabel = mode === "edit" ? "Save Changes" : "Save Weigh-In";
    const dateValue = seed.date || "";
    const weightValue = seed.weight_kg ?? "";
    return {
      title: mode === "edit" ? "⚖️ Edit Weigh-In" : "⚖️ Log Weigh-In",
      html: `
        <label class="field-label" for="weigh-date">Date</label>
        <input id="weigh-date" name="weigh_date" type="date" required value="${dateValue}">
        <label class="field-label" for="weight-kg">Weight (kg)</label>
        <input id="weight-kg" name="weight_kg" type="number" step="0.1" placeholder="Weight (kg)" required value="${weightValue}">
        <button type="submit">${submitLabel}</button>
      `,
      action: mode === "edit" ? `/weigh-ins/${seed.id}/edit` : "/weigh-ins",
    };
  }
  if (kind === "injection") {
    const submitLabel = mode === "edit" ? "Save Changes" : "Save Injection";
    const dateValue = seed.date || "";
    const doseValue = seed.dose_mg ?? "";
    return {
      title: mode === "edit" ? "💉 Edit Injection" : "💉 Log Injection",
      html: `
        <label class="field-label" for="injection-date">Date</label>
        <input id="injection-date" name="injection_date" type="date" required value="${dateValue}">
        <label class="field-label" for="dose-mg">Dose (mg)</label>
        <input id="dose-mg" name="dose_mg" type="number" step="0.1" placeholder="Dose (mg)" required value="${doseValue}">
        <button type="submit">${submitLabel}</button>
      `,
      action: mode === "edit" ? `/injections/${seed.id}/edit` : "/injections",
    };
  }
  const submitLabel = mode === "edit" ? "Save Changes" : "Save Workouts";
  const dateValue = seed.date || "";
  const selectedWorkoutType = String(seed.workout_type || "gym");
  if (mode === "edit") {
    return {
      title: "💪 Edit Workout",
      html: `
        <label class="field-label" for="workout-date">Date</label>
        <input id="workout-date" name="workout_date" type="date" required value="${dateValue}">
        <label class="field-label" for="workout-type">Workout Type</label>
        <select id="workout-type" name="workout_type" required>
          <option value="gym" ${selectedWorkoutType === "gym" ? "selected" : ""}>Gym</option>
          <option value="gym_kgx" ${selectedWorkoutType === "gym_kgx" ? "selected" : ""}>Gym KGX</option>
          <option value="swim" ${selectedWorkoutType === "swim" ? "selected" : ""}>Pool Swim</option>
          <option value="swim_kgx" ${selectedWorkoutType === "swim_kgx" ? "selected" : ""}>Pool Swim KGX</option>
          <option value="lido_swim" ${selectedWorkoutType === "lido_swim" ? "selected" : ""}>Lido Swim</option>
          <option value="reservoir" ${selectedWorkoutType === "reservoir" ? "selected" : ""}>Reservoir Swim</option>
          <option value="sauna" ${selectedWorkoutType === "sauna" ? "selected" : ""}>Sauna</option>
        </select>
        <button type="submit">${submitLabel}</button>
      `,
      action: `/workouts/${seed.id}/edit`,
    };
  }
  return {
    title: "💪 Log Workouts",
    html: `
      <label class="field-label" for="workout-date">Date</label>
      <input id="workout-date" name="workout_date" type="date" required>
      <label class="field-label">Workout Types</label>
      <div class="workout-types">
        <label class="type-chip"><input type="checkbox" name="workout_types" value="gym">Gym</label>
        <label class="type-chip"><input type="checkbox" name="workout_types" value="gym_kgx">Gym KGX</label>
        <label class="type-chip"><input type="checkbox" name="workout_types" value="swim">Pool Swim</label>
        <label class="type-chip"><input type="checkbox" name="workout_types" value="swim_kgx">Pool Swim KGX</label>
        <label class="type-chip"><input type="checkbox" name="workout_types" value="lido_swim">Lido Swim</label>
        <label class="type-chip"><input type="checkbox" name="workout_types" value="reservoir">Reservoir Swim</label>
        <label class="type-chip"><input type="checkbox" name="workout_types" value="sauna">Sauna</label>
      </div>
      <button type="submit">${submitLabel}</button>
    `,
    action: "/workouts",
  };
}

async function reloadHistory() {
  try {
    historyCache = (await loadHistory(20)) || historyCache;
    renderCurrentHistory();
  } catch {
    setStatus("Could not load recent history.");
  }
}

function getCurrentKind() {
  const value = logKindEl?.value;
  return value === "injection" || value === "workout" ? value : "weigh";
}

function renderCurrentHistory() {
  const kind = getCurrentKind();
  const meta = KIND_META[kind];
  if (historyTitle) historyTitle.textContent = meta.historyTitle;
  if (historySubtitle) historySubtitle.textContent = meta.historySubtitle;
  if (logPreview) logPreview.textContent = meta.preview;
  renderHistoryByKind("history-active", historyCache, kind);
}

function openDialog(kind, mode = "create", seed = {}) {
  if (!dialogEl || !dialogForm || !dialogTitle) return;
  const config = formMarkup(kind, mode, seed);
  dialogTitle.textContent = config.title;
  if (dialogStep) dialogStep.textContent = mode === "edit" ? "Edit Mode" : "Step 2 of 2";
  dialogForm.innerHTML = config.html;
  dialogForm.dataset.action = config.action;
  dialogForm.dataset.kind = kind;
  dialogForm.dataset.mode = mode;
  dialogEl.showModal();
}

function seedFromButton(button, kind) {
  if (kind === "weigh") {
    return {
      id: button.dataset.id,
      date: button.dataset.date || "",
      weight_kg: button.dataset.weight || "",
    };
  }
  if (kind === "injection") {
    return {
      id: button.dataset.id,
      date: button.dataset.date || "",
      dose_mg: button.dataset.dose || "",
    };
  }
  return {
    id: button.dataset.id,
    date: button.dataset.date || "",
    workout_type: button.dataset.workoutType || "gym",
  };
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
      if (!window.confirm("Delete this entry?")) return;
      const base = kind === "weigh" ? "/weigh-ins" : kind === "injection" ? "/injections" : "/workouts";
      await postEncoded(`${base}/${id}/delete`);
      setStatus("Entry deleted.");
      await reloadHistory();
      return;
    }

    if (action === "edit") {
      const seed = seedFromButton(button, kind);
      openDialog(kind, "edit", seed);
    }
  } catch (error) {
    setStatus(error?.message || "Could not complete action.");
  }
}

nextBtn?.addEventListener("click", () => {
  openDialog(getCurrentKind(), "create");
});

logKindEl?.addEventListener("change", () => {
  renderCurrentHistory();
});

dialogCancel?.addEventListener("click", () => {
  dialogEl?.close();
});

dialogForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const action = form.dataset.action;
  const kind = form.dataset.kind;
  const mode = form.dataset.mode || "create";
  if (!action) return;

  if (kind === "workout" && mode === "create") {
    const checked = form.querySelectorAll('input[name="workout_types"]:checked').length;
    if (!checked) {
      setStatus("Choose at least one workout type.");
      return;
    }
  }

  try {
    if (mode === "edit") {
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      await postEncoded(action, payload);
      setStatus("Entry updated.");
    } else {
      await postForm(action, form);
      setStatus("Saved.");
    }
    dialogEl?.close();
    await reloadHistory();
  } catch (error) {
    setStatus(error?.message || "Could not save entry.");
  }
});

document.addEventListener("click", (event) => {
  void handleHistoryAction(event);
});

setStatus("Ready.");
renderCurrentHistory();
void reloadHistory();

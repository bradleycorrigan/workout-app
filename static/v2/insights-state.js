export function createInsightsState(initial = {}) {
  let state = {
    selectedMonths: Array.isArray(initial.selectedMonths) ? [...initial.selectedMonths] : [],
    selectedDate: initial.selectedDate || null,
    selectedDateSource: null,
    selectedHeatmap: initial.selectedHeatmap || null,
    mixMode: initial.mixMode || "timeline",
  };

  const listeners = new Set();

  function snapshot() {
    return {
      selectedMonths: [...state.selectedMonths],
      selectedDate: state.selectedDate,
      selectedDateSource: state.selectedDateSource,
      selectedHeatmap: state.selectedHeatmap ? { ...state.selectedHeatmap } : null,
      mixMode: state.mixMode,
    };
  }

  function emit(change) {
    const next = snapshot();
    listeners.forEach((listener) => listener(next, change));
  }

  function setSelectedMonths(months) {
    const normalized = Array.isArray(months)
      ? [...new Set(months.map((m) => String(m || "").trim()).filter(Boolean))].sort()
      : [];
    const unchanged =
      normalized.length === state.selectedMonths.length &&
      normalized.every((m, i) => m === state.selectedMonths[i]);
    if (unchanged) return;

    state = {
      ...state,
      selectedMonths: normalized,
    };
    emit({ type: "selectedMonths" });
  }

  function setSelectedDate(dateKey, source = "unknown") {
    if (!dateKey) return;
    if (state.selectedDate === dateKey && state.selectedDateSource === source) return;
    state = {
      ...state,
      selectedDate: String(dateKey),
      selectedDateSource: source,
    };
    emit({ type: "selectedDate", source });
  }

  function setMixMode(mode) {
    const normalized = mode === "radial" ? "radial" : "timeline";
    if (state.mixMode === normalized) return;
    state = {
      ...state,
      mixMode: normalized,
    };
    emit({ type: "mixMode" });
  }

  function setSelectedHeatmap(selection, source = "heatmap") {
    if (!selection) {
      if (state.selectedHeatmap === null) return;
      state = {
        ...state,
        selectedHeatmap: null,
      };
      emit({ type: "selectedHeatmap", source });
      return;
    }
    const normalized = {
      month: String(selection.month || ""),
      day: Number(selection.day || 0),
      count: Number(selection.count || 0),
      value_gbp: Number(selection.value_gbp || 0),
    };

    if (!normalized.month || !normalized.day) return;

    const prev = state.selectedHeatmap;
    const unchanged =
      prev &&
      prev.month === normalized.month &&
      prev.day === normalized.day &&
      prev.count === normalized.count &&
      prev.value_gbp === normalized.value_gbp;
    if (unchanged) return;

    state = {
      ...state,
      selectedHeatmap: normalized,
    };
    emit({ type: "selectedHeatmap", source });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    get: snapshot,
    subscribe,
    setSelectedMonths,
    setSelectedDate,
    setSelectedHeatmap,
    setMixMode,
  };
}

export function createChartRegistry() {
  const entries = new Map();

  function register(key, renderFn) {
    entries.set(key, { renderFn, cleanup: null });
  }

  function renderOne(key, payload, state) {
    const entry = entries.get(key);
    if (!entry) return;

    if (typeof entry.cleanup === "function") {
      entry.cleanup();
      entry.cleanup = null;
    }

    const cleanup = entry.renderFn(payload, state);
    entry.cleanup = typeof cleanup === "function" ? cleanup : null;
  }

  function renderAll(payload, state) {
    entries.forEach((_, key) => {
      renderOne(key, payload, state);
    });
  }

  function destroy() {
    entries.forEach((entry) => {
      if (typeof entry.cleanup === "function") {
        entry.cleanup();
      }
    });
    entries.clear();
  }

  return {
    register,
    renderOne,
    renderAll,
    destroy,
  };
}

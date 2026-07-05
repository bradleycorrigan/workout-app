import { prefersReducedMotion } from "./chart-core.js";
import { CHART_THEME } from "./chart-theme.js";

const d3 = window.d3;

export function normalizePointer(event, node) {
  const [x, y] = d3.pointer(event, node);
  return { x, y };
}

export function createTooltip(root) {
  if (!root) return null;

  const tooltip = document.createElement("div");
  tooltip.style.position = "absolute";
  tooltip.style.pointerEvents = "none";
  tooltip.style.background = CHART_THEME.semantic.focus;
  tooltip.style.color = CHART_THEME.semantic.onBrand;
  tooltip.style.padding = "8px 10px";
  tooltip.style.borderRadius = "10px";
  tooltip.style.fontSize = "12px";
  tooltip.style.lineHeight = "1.25";
  tooltip.style.opacity = "0";
  tooltip.style.transition = "opacity 120ms ease";

  const parentStyle = window.getComputedStyle(root);
  if (parentStyle.position === "static") {
    root.style.position = "relative";
  }
  root.appendChild(tooltip);

  return {
    show(content, x, y) {
      tooltip.innerHTML = content;
      tooltip.style.left = `${Math.round(x)}px`;
      tooltip.style.top = `${Math.round(y)}px`;
      tooltip.style.opacity = "1";
    },
    hide() {
      tooltip.style.opacity = "0";
    },
    destroy() {
      tooltip.remove();
    },
  };
}

export function transitionIfAllowed(selection, ms) {
  if (prefersReducedMotion()) return selection;
  return selection.transition().duration(ms);
}

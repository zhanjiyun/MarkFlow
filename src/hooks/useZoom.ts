import { useEffect } from "react";

interface UseZoomOptions {
  enabled: boolean;
  setScale: (updater: number | ((value: number) => number)) => void;
}

const MIN_SCALE = 0.8;
const MAX_SCALE = 1.6;
const STEP = 0.05;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
}

function getTargetElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  const element = getTargetElement(target);
  if (!element) return false;

  if (element.closest(".cm-editor, .ProseMirror")) return false;

  return Boolean(element.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function isZoomSurfaceTarget(target: EventTarget | null): boolean {
  const element = getTargetElement(target);
  if (!element) return false;

  return Boolean(element.closest(".preview-content, .split-pane-right, .wysiwyg-container, .ProseMirror"));
}

export function useZoom({ enabled, setScale }: UseZoomOptions) {
  useEffect(() => {
    if (!enabled) return;

    const applyDelta = (delta: number) => {
      setScale((current) => clampScale(current + delta));
    };

    const handleWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isTextInputTarget(event.target) || !isZoomSurfaceTarget(event.target)) {
        return;
      }

      event.preventDefault();
      applyDelta(event.deltaY < 0 ? STEP : -STEP);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || isTextInputTarget(event.target)) return;

      if (event.key === "=" || event.key === "+" || event.code === "NumpadAdd") {
        event.preventDefault();
        applyDelta(STEP);
        return;
      }

      if (event.key === "-" || event.code === "NumpadSubtract") {
        event.preventDefault();
        applyDelta(-STEP);
        return;
      }

      if (event.key === "0" || event.code === "Numpad0") {
        event.preventDefault();
        setScale(1);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, setScale]);
}

export { clampScale, MAX_SCALE, MIN_SCALE };

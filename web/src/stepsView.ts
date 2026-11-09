/**
 * How the editor shows a workflow's steps: as a graph to pan and zoom, or as
 * an outline to read down.
 *
 * It shows the graph unless the window is phone-narrow, and remembers what
 * the person chooses in this browser.
 */

export type StepsView = "graph" | "outline";

export const STEPS_VIEW_KEY = "azathoth-ui.steps-view";

/** The windows narrow enough to show the outline unless the person chose the graph. */
export const NARROW_QUERY = "(max-width: 48rem)";

/** Returns whether a window is phone-narrow, or `false` where it cannot say. */
export function isNarrow(view: Pick<Window, "matchMedia"> | null): boolean {
  try {
    return typeof view?.matchMedia === "function" && view.matchMedia(NARROW_QUERY).matches;
  } catch {
    return false;
  }
}

/** Returns the view chosen in one storage, or the one that suits the window. */
export function readStepsView(storage: Storage | null, narrow: boolean): StepsView {
  try {
    const value = storage?.getItem(STEPS_VIEW_KEY) ?? null;

    if (value === "graph" || value === "outline") {
      return value;
    }
  } catch {
    // Choose by the window.
  }
  return narrow ? "outline" : "graph";
}

/** Remembers one view in one storage, doing without when it cannot be written. */
export function saveStepsView(storage: Storage | null, view: StepsView): void {
  try {
    storage?.setItem(STEPS_VIEW_KEY, view);
  } catch {
    // The choice holds for this visit only.
  }
}

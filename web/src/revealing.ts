/**
 * Whether a page's restricted data has been shown (ADR 0011): once any of
 * it is shown, all of it is, until the page is left. Nothing is
 * remembered, so it is hidden again every time the page is opened.
 */

import { createContext, useContext } from "react";

/** Whether a page's restricted data has been shown, and how to show it. */
export interface Revealing {
  readonly revealed: boolean;
  readonly reveal: () => void;
}

/** The page's scope of restricted data, which `RestrictedScope` provides. */
export const RevealingContext = createContext<Revealing | null>(null);

/**
 * Returns whether a page's restricted data may be shown now, and how to show it.
 *
 * @throws Error Outside a `RestrictedScope`.
 */
export function useRevealing(): Revealing {
  const scope = useContext(RevealingContext);

  if (scope === null) {
    throw new Error("Restricted data is shown within a RestrictedScope.");
  }

  return scope;
}

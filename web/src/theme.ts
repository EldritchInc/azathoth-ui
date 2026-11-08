/**
 * The editor's light and dark themes.
 *
 * It follows the system until the person chooses one, and remembers the
 * choice in this browser. The choice is named on the root element as
 * `data-theme`; the styles do the rest.
 */

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

export const THEME_KEY = "azathoth-ui.theme";

function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
}

/** Returns this browser's storage, or `null` where it cannot be used. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Returns the theme chosen in one storage, or `system` when none can be read. */
export function readTheme(storage: Storage | null): ThemeChoice {
  try {
    const value = storage?.getItem(THEME_KEY) ?? null;

    return isThemeChoice(value) ? value : "system";
  } catch {
    return "system";
  }
}

/** Remembers one choice in one storage, doing without when it cannot be written. */
export function saveTheme(storage: Storage | null, choice: ThemeChoice): void {
  try {
    if (choice === "system") {
      storage?.removeItem(THEME_KEY);
    } else {
      storage?.setItem(THEME_KEY, choice);
    }
  } catch {
    // The choice holds for this visit only.
  }
}

/** Names one choice on the root element the styles read it from. */
export function applyTheme(root: HTMLElement, choice: ThemeChoice): void {
  if (choice === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = choice;
  }
}

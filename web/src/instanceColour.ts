/**
 * The colour each instance is shown in (ADR 0009): drawn from its name, so
 * the same remote has the same colour on every computer and nothing is
 * stored. The local instance has a colour of its own that no remote is
 * given. Lightness and chroma come from the theme, so every colour reads in
 * light and in dark.
 */

import type { CSSProperties } from "react";

import { LOCAL_SCOPE } from "./scope";

/** Returns the hue, 0 to 359, a name draws: its FNV-1a hash, spread round the wheel. */
export function hueOf(name: string): number {
  let hash = 0x811c9dc5;

  for (const character of name) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return Math.floor(((hash >>> 0) / 0x100000000) * 360);
}

/** Returns the colour an instance is shown in, as a CSS colour. */
export function colourOf(name: string): string {
  if (name === LOCAL_SCOPE.name) {
    return "var(--instance-local)";
  }

  return `oklch(var(--instance-lightness) var(--instance-chroma) ${String(hueOf(name))})`;
}

/** Returns the style that gives an element an instance's colour, as `--instance`. */
export function instanceStyle(name: string): CSSProperties {
  return { "--instance": colourOf(name) } as CSSProperties;
}

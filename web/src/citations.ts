/**
 * A run's verified citations, read from the Web Annotations Azathoth writes
 * of them (Azathoth's ADR 0117): what each says, the source it was found
 * in, and what it quotes (ADR 0012).
 */

import type { Annotations } from "./api/types";

/** One verified citation, as the editor shows it; what it does not say is null. */
export interface Citation {
  readonly id: string | null;
  /** Azathoth's description of it: the step that cited it, and what it supports. */
  readonly description: string | null;
  /** Where it was found: the origin's URI, or the content's `ni:` URI. */
  readonly source: string | null;
  /** The text it quotes, when a selector quotes it. */
  readonly quote: string | null;
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function textOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function quoteOf(selector: unknown): string | null {
  const selectors: readonly unknown[] = Array.isArray(selector) ? selector : [selector];

  for (const each of selectors) {
    const found = recordOf(each);

    if (found.type === "TextQuoteSelector" && typeof found.exact === "string") {
      return found.exact;
    }
  }
  return null;
}

/** Returns what one annotation of a run's collection says of its citation. */
export function citationOf(annotation: Readonly<Record<string, unknown>>): Citation {
  const target = recordOf(annotation.target);

  return {
    id: textOf(annotation.id),
    description: textOf(recordOf(annotation.body).value),
    source: textOf(target.source),
    quote: quoteOf(target.selector),
  };
}

/** Returns whether a source is a page a browser can open, so the editor links it. */
export function isWebLink(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

/** Returns how Azathoth sums up a run's citations, with how many it left out, or nothing. */
export function collectionLabel(annotations: Annotations): string | null {
  return textOf(annotations.collection.label);
}

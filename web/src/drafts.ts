/**
 * Unsaved edits to workflows, kept in this browser until they are saved or
 * discarded, so leaving the editor or reloading it loses nothing.
 *
 * A draft holds the document as it stands and the revision it was started
 * from, `null` for a workflow never saved.
 */

import { asObject, asText, isObject, type JsonObject, type JsonValue } from "./editing";

/** A workflow's unsaved document, and the revision it was started from. */
export interface Draft {
  readonly document: JsonObject;
  readonly base: number | null;
}

/** What each draft's key in the browser's storage starts with. */
export const DRAFT_PREFIX = "azathoth-ui.draft.";

/** Returns the key a workflow's draft is kept under. */
export function draftKey(id: string): string {
  return `${DRAFT_PREFIX}${id}`;
}

/** Returns a workflow document's id, or `null` when it has none. */
export function workflowId(document: JsonObject): string | null {
  return asText(asObject(document.metadata).id);
}

/** Returns a workflow document's name, or `null` when it has none. */
export function workflowName(document: JsonObject): string | null {
  const name = asText(asObject(document.metadata).name);

  return name === null || name.trim() === "" ? null : name;
}

function parsed(text: string | null): Draft | null {
  if (text === null) {
    return null;
  }

  let value: JsonValue;

  try {
    value = JSON.parse(text) as JsonValue;
  } catch {
    return null;
  }

  const fields = asObject(value);
  const base = fields.base;

  return isObject(fields.document) &&
    (base === null || (typeof base === "number" && Number.isInteger(base) && base > 0))
    ? { document: fields.document, base }
    : null;
}

/** Returns a workflow's draft, or `null` when there is none or it cannot be read. */
export function readDraft(storage: Storage | null, id: string): Draft | null {
  try {
    return parsed(storage?.getItem(draftKey(id)) ?? null);
  } catch {
    return null;
  }
}

/** Keeps a workflow's draft, and returns whether it could. */
export function saveDraft(storage: Storage | null, id: string, draft: Draft): boolean {
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(draftKey(id), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** Forgets a workflow's draft. */
export function discardDraft(storage: Storage | null, id: string): void {
  try {
    storage?.removeItem(draftKey(id));
  } catch {
    // There is nothing to forget.
  }
}

/** Returns every draft kept, by its workflow's id, in no particular order. */
export function allDrafts(storage: Storage | null): Map<string, Draft> {
  const drafts = new Map<string, Draft>();

  try {
    for (let index = 0; index < (storage?.length ?? 0); index += 1) {
      const key = storage?.key(index) ?? null;

      if (key?.startsWith(DRAFT_PREFIX) === true) {
        const draft = parsed(storage?.getItem(key) ?? null);

        if (draft !== null) {
          drafts.set(key.slice(DRAFT_PREFIX.length), draft);
        }
      }
    }
  } catch {
    // What could be read is what there is.
  }
  return drafts;
}

function canonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return (value as readonly JsonValue[]).map(canonical);
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key] ?? null)]),
    );
  }
  return value;
}

/** Returns whether two documents say the same, whatever order their keys are in. */
export function same(first: JsonObject, second: JsonObject): boolean {
  return JSON.stringify(canonical(first)) === JSON.stringify(canonical(second));
}

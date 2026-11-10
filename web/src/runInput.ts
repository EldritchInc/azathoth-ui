/**
 * What a person gives a run, as they give it: text, JSON, a file or
 * nothing, and what the run would be given from it (ADR 0007).
 */

import type { RunGiven, SentFile } from "./api/client";
import { base64Of, fileProblem, mediaTypeOf, readJson, type InputMode } from "./running";

/** A file a person chose, read and ready to send. */
export interface ChosenFile {
  readonly name: string;
  readonly size: number;
  readonly sent: SentFile;
}

/** What a person gave a run so far, as they gave it. */
export interface InputDraft {
  readonly mode: InputMode;
  readonly text: string;
  readonly json: string;
  readonly file: ChosenFile | null;
}

/** A run given text, as most workflows take it. */
export const NEW_DRAFT: InputDraft = { mode: "text", text: "", json: "", file: null };

/** Returns what a run would be given from a draft, or why it can't be given it yet. */
export function givenOf(draft: InputDraft): {
  readonly given: RunGiven | null;
  readonly problem: string | null;
} {
  switch (draft.mode) {
    case "text":
      return { given: { kind: "json", value: draft.text }, problem: null };
    case "json": {
      const read = readJson(draft.json);

      return read.ok
        ? { given: { kind: "json", value: read.value }, problem: null }
        : { given: null, problem: read.problem };
    }
    case "file":
      return draft.file === null
        ? { given: null, problem: "Choose a file, or drop one here." }
        : { given: { kind: "file", file: draft.file.sent }, problem: null };
    case "none":
      return { given: { kind: "none" }, problem: null };
  }
}

/**
 * Returns a file's bytes, read with a `FileReader`, which every browser
 * and the test DOM give, where `Blob.arrayBuffer` is not always there.
 */
export function bytesOf(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      const result = reader.result;

      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result));
      } else {
        reject(new Error("The file was not read as bytes."));
      }
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("The file couldn't be read."));
    });
    reader.readAsArrayBuffer(file);
  });
}

/** Reads one file as a run would be given it, or says why Azathoth would not take it. */
export async function readFile(
  file: File,
): Promise<{ readonly chosen: ChosenFile | null; readonly problem: string | null }> {
  const problem = fileProblem(file.name, file.type, file.size);
  const mediaType = mediaTypeOf(file.name, file.type);

  if (problem !== null || mediaType === null) {
    return { chosen: null, problem };
  }

  const content = base64Of(await bytesOf(file));

  return {
    chosen: { name: file.name, size: file.size, sent: { media_type: mediaType, content } },
    problem: null,
  };
}

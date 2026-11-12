/**
 * Importing documents into the local instance, one file at a time.
 *
 * Each file becomes its component's next revision; nothing is ever changed in
 * place. Every file gets an outcome the person can read and dismiss, and the
 * kind's lists, pages and histories are refetched once it is in.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { MAX_DOCUMENT_BYTES, importDocument } from "./api/client";
import type { ComponentDetail } from "./api/types";
import type { Kind } from "./kinds";

/** What became of one file. */
export type Outcome =
  | { readonly id: number; readonly fileName: string; readonly state: "importing" }
  | {
      readonly id: number;
      readonly fileName: string;
      readonly state: "imported";
      readonly created: boolean;
      readonly detail: ComponentDetail;
    }
  | {
      readonly id: number;
      readonly fileName: string;
      readonly state: "failed";
      readonly message: string;
    };

export const TOO_LARGE_MESSAGE = "It is larger than 10 MB, the most the editor imports.";

export const UNREADABLE_MESSAGE = "The browser could not read it.";

export const FAILED_MESSAGE = "The import failed.";

/**
 * Returns a file's text, read as UTF-8.
 *
 * A `FileReader` rather than `Blob.text()`, which some environments the
 * editor is tested in do not have.
 */
export function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error(UNREADABLE_MESSAGE));
    };
    reader.readAsText(file);
  });
}

/** Returns why a file cannot be imported before it is sent, or `null` when it may be. */
export function refusal(file: { readonly size: number }): string | null {
  return file.size > MAX_DOCUMENT_BYTES ? TOO_LARGE_MESSAGE : null;
}

/** Imports files of one kind into the local instance, keeping what became of each. */
export function useImporter(kind: Kind): {
  readonly outcomes: readonly Outcome[];
  readonly busy: boolean;
  readonly importFiles: (files: readonly File[]) => Promise<void>;
  readonly dismiss: (id: number) => void;
} {
  const client = useQueryClient();
  const [outcomes, setOutcomes] = useState<readonly Outcome[]>([]);
  const [busy, setBusy] = useState(false);
  const next = useRef(0);

  const settle = useCallback((outcome: Outcome) => {
    setOutcomes((current) => current.map((item) => (item.id === outcome.id ? outcome : item)));
  }, []);

  const importFiles = useCallback(
    async (files: readonly File[]) => {
      const started = files.map((file) => {
        next.current += 1;

        return { id: next.current, fileName: file.name, state: "importing" } as const;
      });

      setOutcomes((current) => [...started, ...current]);
      setBusy(true);

      for (const [index, file] of files.entries()) {
        const { id, fileName } = started[index] ?? { id: 0, fileName: file.name };
        const refused = refusal(file);

        if (refused !== null) {
          settle({ id, fileName, state: "failed", message: refused });
          continue;
        }

        let text: string;

        try {
          text = await readText(file);
        } catch {
          settle({ id, fileName, state: "failed", message: UNREADABLE_MESSAGE });
          continue;
        }

        try {
          const { created, detail } = await importDocument(kind, text);
          settle({ id, fileName, state: "imported", created, detail });
        } catch (error) {
          const message = error instanceof Error ? error.message : FAILED_MESSAGE;
          settle({ id, fileName, state: "failed", message });
        }
      }

      setBusy(false);
      await client.invalidateQueries({ queryKey: [kind] });
    },
    [client, kind, settle],
  );

  const dismiss = useCallback((id: number) => {
    setOutcomes((current) => current.filter((item) => item.id !== id));
  }, []);

  return { outcomes, busy, importFiles, dismiss };
}

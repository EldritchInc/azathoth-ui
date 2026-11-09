/**
 * The editor's data, kept by TanStack Query: fetched once, shared by every
 * component that shows it, refreshed when the window regains focus, and
 * refetched after anything changes it.
 */

import { QueryClient, useQuery, type UseQueryResult } from "@tanstack/react-query";

import { ApiFailure, fetchDetail, fetchEditor, fetchHistory } from "./api/client";
import type { ComponentDetail, EditorDescription, Summary } from "./api/types";
import {
  DESCRIPTIONS,
  detailApiPath,
  historyApiPath,
  type ComponentRef,
  type Kind,
  type SummaryOf,
} from "./kinds";

/** The keys the editor's data is kept under. */
export const queryKeys = {
  editor: ["editor"] as const,
  list: (kind: Kind) => [kind, "list"] as const,
  detail: (kind: Kind, ref: ComponentRef, revision: number | null) =>
    [kind, "detail", ref.id, ref.version ?? null, revision] as const,
  history: (kind: Kind, ref: ComponentRef) =>
    [kind, "history", ref.id, ref.version ?? null] as const,
};

/** Returns whether a failed request is worth trying again: not when the server refused it. */
export function retryable(failures: number, error: unknown): boolean {
  const refused = error instanceof ApiFailure && error.status !== null && error.status < 500;

  return !refused && failures < 2;
}

/** Returns the client that keeps the editor's data. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: retryable, staleTime: 5_000 },
    },
  });
}

/** Returns the editor, and how its commands name its database. */
export function useEditor(): UseQueryResult<EditorDescription, ApiFailure> {
  return useQuery<EditorDescription, ApiFailure>({
    queryKey: queryKeys.editor,
    queryFn: ({ signal }) => fetchEditor({ signal }),
    staleTime: Infinity,
  });
}

/** Returns one kind's list: every component of the kind at its latest revision. */
export function useList<K extends Kind>(kind: K): UseQueryResult<SummaryOf[K][], ApiFailure> {
  return useQuery<SummaryOf[K][], ApiFailure>({
    queryKey: queryKeys.list(kind),
    queryFn: ({ signal }) => DESCRIPTIONS[kind].fetch({ signal }),
  });
}

/** Returns one revision of a component with its document, the latest when none is named. */
export function useDetail(
  kind: Kind,
  ref: ComponentRef,
  revision: number | null,
): UseQueryResult<ComponentDetail, ApiFailure> {
  return useQuery<ComponentDetail, ApiFailure>({
    queryKey: queryKeys.detail(kind, ref, revision),
    queryFn: ({ signal }) => fetchDetail(detailApiPath(kind, ref, revision), { signal }),
  });
}

/** Returns a component's revisions, newest first; for a tool, those of its one version. */
export function useHistory(kind: Kind, ref: ComponentRef): UseQueryResult<Summary[], ApiFailure> {
  return useQuery<Summary[], ApiFailure>({
    queryKey: queryKeys.history(kind, ref),
    queryFn: ({ signal }) => fetchHistory(historyApiPath(kind, ref), { signal }),
  });
}

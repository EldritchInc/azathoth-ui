/**
 * The editor's data, kept by TanStack Query: fetched once, shared by every
 * component that shows it, refreshed when the window regains focus, and
 * refetched after anything changes it.
 */

import {
  QueryClient,
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  ApiFailure,
  addToPortfolio,
  cancelLiveRun,
  checkWorkflow,
  fetchDetail,
  fetchEditor,
  fetchHistory,
  fetchLiveRun,
  fetchLiveRuns,
  fetchModels,
  fetchPortfolio,
  fetchReadiness,
  fetchRun,
  fetchWorkflowRuns,
  addRemote,
  fetchRemoteStatus,
  fetchRemotes,
  matchModels,
  removeFromPortfolio,
  removeRemote,
  startRun,
  startTrial,
  type RemoteToAdd,
  type RunGiven,
  type Selection,
  type TrialStart,
} from "./api/client";
import type {
  ComponentDetail,
  EditorDescription,
  LiveRun,
  ModelListing,
  ModelSummary,
  NamedRemote,
  PortfolioEntry,
  PortfolioRemoval,
  RemoteStatus,
  RunDetail,
  RunSummary,
  Summary,
  WorkflowCheck,
  WorkflowReadiness,
} from "./api/types";
import type { JsonObject } from "./editing";
import type { WorkflowDocument } from "./selection";
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
  models: ["models"] as const,
  modelList: ["models", "list"] as const,
  portfolio: ["models", "portfolio"] as const,
  matching: (requirements: string) => ["models", "matching", requirements] as const,
  check: (document: string) => ["check", document] as const,
  readiness: (document: string) => ["readiness", document] as const,
  live: ["live"] as const,
  liveList: ["live", "list"] as const,
  remotes: ["remotes"] as const,
  remoteList: ["remotes", "list"] as const,
  remoteStatus: (name: string, selection: string) =>
    ["remotes", "status", name, selection] as const,
  liveRun: (handle: string) => ["live", "run", handle] as const,
  runs: ["runs"] as const,
  workflowRuns: (workflowId: string) => ["runs", "workflow", workflowId] as const,
  run: (runId: string) => ["runs", "run", runId] as const,
};

/** How often the editor asks which live runs are running, while any is. */
export const RUNNING_POLL_MS = 2_000;

/** How often it asks while none is, to find runs started in another tab. */
export const IDLE_POLL_MS = 15_000;

/** How long a remote's status is fresh: older than this, coming back to the tab asks again. */
export const REMOTE_STATUS_STALE_MS = 30_000;

/** How often a remote's status is asked again while its tab is visible; never while hidden. */
export const REMOTE_STATUS_POLL_MS = 60_000;

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

/**
 * Returns what the providers serve, marked by the local portfolio. The
 * server keeps what the providers said for a while, so asking it again is
 * cheap; `useRefreshModels` makes it ask the providers.
 */
export function useModels(): UseQueryResult<ModelListing, ApiFailure> {
  return useQuery<ModelListing, ApiFailure>({
    queryKey: queryKeys.modelList,
    queryFn: ({ signal }) => fetchModels({}, { signal }),
    staleTime: 60_000,
  });
}

/** Returns a refresh of the catalog: the server asks the providers again. */
export function useRefreshModels(): UseMutationResult<ModelListing, ApiFailure, void> {
  const client = useQueryClient();

  return useMutation<ModelListing, ApiFailure>({
    mutationFn: () => fetchModels({ refresh: true }),
    onSuccess: (listing) => {
      client.setQueryData(queryKeys.modelList, listing);
    },
  });
}

/** Returns the models the local portfolio authorizes. */
export function usePortfolio(): UseQueryResult<PortfolioEntry[], ApiFailure> {
  return useQuery<PortfolioEntry[], ApiFailure>({
    queryKey: queryKeys.portfolio,
    queryFn: ({ signal }) => fetchPortfolio({ signal }),
  });
}

/** One change to the local portfolio: a model added, or removed, forced or not. */
export interface PortfolioChange {
  readonly identifier: string;
  readonly add: boolean;
  readonly force?: boolean;
}

/** Returns a change to the local portfolio, after which every view of the models is fetched again. */
export function usePortfolioChange(): UseMutationResult<
  PortfolioEntry | PortfolioRemoval,
  ApiFailure,
  PortfolioChange
> {
  const client = useQueryClient();

  return useMutation<PortfolioEntry | PortfolioRemoval, ApiFailure, PortfolioChange>({
    mutationFn: ({ identifier, add, force = false }) =>
      add ? addToPortfolio(identifier) : removeFromPortfolio(identifier, { force }),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.models }),
  });
}

/** The local instance's workflows, each at its latest revision with its document. */
export interface WorkflowDocuments {
  readonly workflows: readonly WorkflowDocument[];
  /** Whether a workflow is still being fetched. */
  readonly pending: boolean;
  /** Whether a workflow could not be fetched; those that could are still given. */
  readonly failed: boolean;
}

/** Returns every workflow in the local instance with its latest document. */
export function useWorkflowDocuments(): WorkflowDocuments {
  const list = useList("workflows");
  const details = useQueries({
    queries: (list.data ?? []).map((summary) => ({
      queryKey: queryKeys.detail("workflows", { id: summary.id }, null),
      queryFn: ({ signal }: { readonly signal: AbortSignal }) =>
        fetchDetail(detailApiPath("workflows", { id: summary.id }, null), { signal }),
    })),
  });

  return {
    workflows: details.flatMap((detail) =>
      detail.data === undefined
        ? []
        : [
            {
              id: detail.data.id,
              name: detail.data.name,
              document: detail.data.document as JsonObject,
            },
          ],
    ),
    pending: list.isPending || details.some((detail) => detail.isPending),
    failed: list.isError || details.some((detail) => detail.isError),
  };
}

/**
 * Returns every live run the editor remembers, newest first, asked again
 * every couple of seconds while any is running and now and then while none is.
 */
export function useLiveRuns(): UseQueryResult<LiveRun[], ApiFailure> {
  return useQuery<LiveRun[], ApiFailure>({
    queryKey: queryKeys.liveList,
    queryFn: ({ signal }) => fetchLiveRuns({ signal }),
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.state === "running") === true
        ? RUNNING_POLL_MS
        : IDLE_POLL_MS,
  });
}

/** Returns one live run as the server last described it. */
export function useLiveRun(handle: string): UseQueryResult<LiveRun, ApiFailure> {
  return useQuery<LiveRun, ApiFailure>({
    queryKey: queryKeys.liveRun(handle),
    queryFn: ({ signal }) => fetchLiveRun(handle, { signal }),
  });
}

/** What starting a run takes: the workflow, and what it is given. */
export interface RunStart {
  readonly workflowId: string;
  readonly given: RunGiven;
}

/** Returns a start of a live run, after which the live runs are fetched again. */
export function useStartRun(): UseMutationResult<LiveRun, ApiFailure, RunStart> {
  const client = useQueryClient();

  return useMutation<LiveRun, ApiFailure, RunStart>({
    mutationFn: ({ workflowId, given }) => startRun(workflowId, given),
    onSuccess: (run) => {
      client.setQueryData(queryKeys.liveRun(run.handle), run);
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.liveList }),
  });
}

/** Returns a start of trying one step alone, after which the live runs are fetched again. */
export function useTryStep(): UseMutationResult<LiveRun, ApiFailure, TrialStart> {
  const client = useQueryClient();

  return useMutation<LiveRun, ApiFailure, TrialStart>({
    mutationFn: (start) => startTrial(start),
    onSuccess: (run) => {
      client.setQueryData(queryKeys.liveRun(run.handle), run);
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.liveList }),
  });
}

/** Returns a way to ask a live run to stop. */
export function useCancelRun(): UseMutationResult<LiveRun, ApiFailure, string> {
  const client = useQueryClient();

  return useMutation<LiveRun, ApiFailure, string>({
    mutationFn: (handle) => cancelLiveRun(handle),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.live }),
  });
}

/** Returns a workflow's kept runs, newest first: the newest `RUNS_LISTED` of them. */
export function useWorkflowRuns(workflowId: string): UseQueryResult<RunSummary[], ApiFailure> {
  return useQuery<RunSummary[], ApiFailure>({
    queryKey: queryKeys.workflowRuns(workflowId),
    queryFn: ({ signal }) => fetchWorkflowRuns(workflowId, { signal }),
  });
}

/** Returns one kept run with its steps; a kept run never changes. */
export function useRun(runId: string): UseQueryResult<RunDetail, ApiFailure> {
  return useQuery<RunDetail, ApiFailure>({
    queryKey: queryKeys.run(runId),
    queryFn: ({ signal }) => fetchRun(runId, { signal }),
    staleTime: Infinity,
  });
}

/**
 * Returns the local portfolio's models that meet a step's requirements, in
 * the order a run tries them, as Azathoth matches them. While new
 * requirements are asked about, the last answer stands.
 */
export function useMatching(
  requirements: Readonly<Record<string, unknown>>,
): UseQueryResult<ModelSummary[], ApiFailure> {
  const key = JSON.stringify(requirements);

  return useQuery<ModelSummary[], ApiFailure>({
    queryKey: queryKeys.matching(key),
    queryFn: ({ signal }) => matchModels(requirements, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * Returns what Azathoth makes of a workflow document, as it is written. While
 * a changed document is asked about, the last answer stands.
 */
export function useWorkflowCheck(document: unknown): UseQueryResult<WorkflowCheck, ApiFailure> {
  const key = JSON.stringify(document);

  return useQuery<WorkflowCheck, ApiFailure>({
    queryKey: queryKeys.check(key),
    queryFn: ({ signal }) => checkWorkflow(document, { signal }),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
}

/**
 * Returns whether each step of a workflow document could run here now. It
 * asks the providers, so it is asked only when `enabled`, and kept a minute.
 */
export function useReadiness(
  document: unknown,
  { enabled = true }: { readonly enabled?: boolean } = {},
): UseQueryResult<WorkflowReadiness, ApiFailure> {
  const key = JSON.stringify(document);

  return useQuery<WorkflowReadiness, ApiFailure>({
    queryKey: queryKeys.readiness(key),
    queryFn: ({ signal }) => fetchReadiness(document, { signal }),
    staleTime: 60_000,
    enabled,
  });
}

/** Returns every remote the editor's instance names, by name. */
export function useRemotes(): UseQueryResult<NamedRemote[], ApiFailure> {
  return useQuery<NamedRemote[], ApiFailure>({
    queryKey: queryKeys.remoteList,
    queryFn: ({ signal }) => fetchRemotes({ signal }),
  });
}

/** One change to the remotes named: one named, or a name forgotten. */
export type RemoteChange =
  | { readonly add: true; readonly remote: RemoteToAdd }
  | { readonly add: false; readonly name: string };

/** Returns a change to the remotes named, after which every view of remotes is fetched again. */
export function useRemoteChange(): UseMutationResult<NamedRemote, ApiFailure, RemoteChange> {
  const client = useQueryClient();

  return useMutation<NamedRemote, ApiFailure, RemoteChange>({
    mutationFn: (change) => (change.add ? addRemote(change.remote) : removeRemote(change.name)),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.remotes }),
  });
}

/**
 * Returns how what is selected relates to a named remote's, asked again
 * when the page is opened, when its tab is come back to after half a
 * minute, every minute while the tab is visible, and after any push or pull
 * from the editor, which fetches every view of remotes again. A hidden tab
 * never asks.
 */
export function useRemoteStatus(
  name: string,
  selection: Selection = {},
  { enabled = true }: { readonly enabled?: boolean } = {},
): UseQueryResult<RemoteStatus, ApiFailure> {
  return useQuery<RemoteStatus, ApiFailure>({
    queryKey: queryKeys.remoteStatus(name, JSON.stringify(selection)),
    queryFn: ({ signal }) => fetchRemoteStatus(name, selection, { signal }),
    staleTime: REMOTE_STATUS_STALE_MS,
    refetchOnWindowFocus: true,
    refetchInterval: REMOTE_STATUS_POLL_MS,
    refetchIntervalInBackground: false,
    enabled,
  });
}

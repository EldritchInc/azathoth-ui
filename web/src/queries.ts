/**
 * The editor's data, kept by TanStack Query: fetched once, shared by every
 * component that shows it, refreshed when the window regains focus, and
 * refetched after anything changes it.
 *
 * What an instance holds is asked of the instance the page acts on, and
 * kept under its name (ADR 0009); what belongs to the editor, its
 * description and its remotes, is kept apart from every instance.
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
  declareModelPolicy,
  fetchCommands,
  fetchDetail,
  fetchInvocation,
  fetchProduction,
  fetchProductionRevisions,
  fetchWorkflowInvocations,
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
  promoteWorkflow,
  pullFromRemote,
  pushToRemote,
  removeFromPortfolio,
  removeRemote,
  resumeInvocation,
  rollBackWorkflow,
  startInvocation,
  startRun,
  startTrial,
  type InvocationStart,
  type RemoteToAdd,
  type RunStart,
  type Selection,
  type TrialStart,
} from "./api/client";
import type {
  ComponentDetail,
  DataPolicy,
  EditorDescription,
  InstanceCommands,
  InvocationDetail,
  InvocationSummary,
  LiveRun,
  ModelListing,
  ModelSummary,
  NamedRemote,
  PortfolioEntry,
  PortfolioRemoval,
  ProductionRevisionSummary,
  ProductionState,
  PullReport,
  PushReport,
  RemoteStatus,
  RunDetail,
  RunSummary,
  Sensitivity,
  Summary,
  WorkflowCheck,
  WorkflowReadiness,
} from "./api/types";
import type { JsonObject } from "./editing";
import type { WorkflowDocument } from "./selection";
import {
  DESCRIPTIONS,
  KINDS,
  detailApiPath,
  historyApiPath,
  type ComponentRef,
  type Kind,
  type SummaryOf,
} from "./kinds";
import { LOCAL_SCOPE, scoped, useScope } from "./scope";

/** The keys the editor's data is kept under. */
export const queryKeys = {
  editor: ["editor"] as const,
  commands: ["commands"] as const,
  list: (kind: Kind) => [kind, "list"] as const,
  detail: (kind: Kind, ref: ComponentRef, revision: number | null) =>
    [kind, "detail", ref.id, ref.version ?? null, revision] as const,
  history: (kind: Kind, ref: ComponentRef) =>
    [kind, "history", ref.id, ref.version ?? null] as const,
  models: ["models"] as const,
  modelList: ["models", "list"] as const,
  portfolio: ["models", "portfolio"] as const,
  matching: (requirements: string, sensitivity: Sensitivity | null = null) =>
    ["models", "matching", requirements, sensitivity] as const,
  check: (document: string) => ["check", document] as const,
  readiness: (document: string, sensitivity: Sensitivity | null = null) =>
    ["readiness", document, sensitivity] as const,
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
  production: (workflowId: string) => ["production", workflowId] as const,
  productionRevisions: (workflowId: string) => ["production", workflowId, "revisions"] as const,
  invocations: ["invocations"] as const,
  workflowInvocations: (workflowId: string) => ["invocations", "workflow", workflowId] as const,
  invocation: (invocationId: string) => ["invocations", "one", invocationId] as const,
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

/** Returns the editor: its version, the shell it writes commands for, and its providers. */
export function useEditor(): UseQueryResult<EditorDescription, ApiFailure> {
  return useQuery<EditorDescription, ApiFailure>({
    queryKey: queryKeys.editor,
    queryFn: ({ signal }) => fetchEditor({ signal }),
    staleTime: Infinity,
  });
}

/** Returns the instance's name, and what goes before a command so that it acts on it. */
export function useCommands(): UseQueryResult<InstanceCommands, ApiFailure> {
  const scope = useScope();

  return useQuery<InstanceCommands, ApiFailure>({
    queryKey: scoped(scope, queryKeys.commands),
    queryFn: ({ signal }) => fetchCommands({ signal, base: scope.api }),
    staleTime: Infinity,
  });
}

/** Returns one kind's list: every component of the kind at its latest revision. */
export function useList<K extends Kind>(kind: K): UseQueryResult<SummaryOf[K][], ApiFailure> {
  const scope = useScope();

  return useQuery<SummaryOf[K][], ApiFailure>({
    queryKey: scoped(scope, queryKeys.list(kind)),
    queryFn: ({ signal }) => DESCRIPTIONS[kind].fetch({ signal, base: scope.api }),
  });
}

/** Returns one revision of a component with its document, the latest when none is named. */
export function useDetail(
  kind: Kind,
  ref: ComponentRef,
  revision: number | null,
): UseQueryResult<ComponentDetail, ApiFailure> {
  const scope = useScope();

  return useQuery<ComponentDetail, ApiFailure>({
    queryKey: scoped(scope, queryKeys.detail(kind, ref, revision)),
    queryFn: ({ signal }) => fetchDetail(detailApiPath(kind, ref, revision, scope.api), { signal }),
  });
}

/** Returns a component's revisions, newest first; for a tool, those of its one version. */
export function useHistory(kind: Kind, ref: ComponentRef): UseQueryResult<Summary[], ApiFailure> {
  const scope = useScope();

  return useQuery<Summary[], ApiFailure>({
    queryKey: scoped(scope, queryKeys.history(kind, ref)),
    queryFn: ({ signal }) => fetchHistory(historyApiPath(kind, ref, scope.api), { signal }),
  });
}

/**
 * Returns what the providers serve, marked by the local portfolio. The
 * server keeps what the providers said for a while, so asking it again is
 * cheap; `useRefreshModels` makes it ask the providers.
 */
export function useModels(): UseQueryResult<ModelListing, ApiFailure> {
  const scope = useScope();

  return useQuery<ModelListing, ApiFailure>({
    queryKey: scoped(scope, queryKeys.modelList),
    queryFn: ({ signal }) => fetchModels({}, { signal, base: scope.api }),
    staleTime: 60_000,
  });
}

/** Returns a refresh of the catalog: the server asks the providers again. */
export function useRefreshModels(): UseMutationResult<ModelListing, ApiFailure, void> {
  const client = useQueryClient();
  const scope = useScope();

  return useMutation<ModelListing, ApiFailure>({
    mutationFn: () => fetchModels({ refresh: true }, { base: scope.api }),
    onSuccess: (listing) => {
      client.setQueryData(scoped(scope, queryKeys.modelList), listing);
    },
  });
}

/** Returns the models the local portfolio authorizes. */
export function usePortfolio(): UseQueryResult<PortfolioEntry[], ApiFailure> {
  const scope = useScope();

  return useQuery<PortfolioEntry[], ApiFailure>({
    queryKey: scoped(scope, queryKeys.portfolio),
    queryFn: ({ signal }) => fetchPortfolio({ signal, base: scope.api }),
  });
}

/** One change to the local portfolio: a model added, or removed, forced or not. */
export interface PortfolioChange {
  readonly identifier: string;
  readonly add: boolean;
  readonly force?: boolean;
}

/** A model's policy to declare: the model, and both answers (ADR 0011). */
export interface PolicyDeclaration {
  readonly identifier: string;
  readonly policy: DataPolicy;
}

/**
 * Returns a declaration of a model's policy, after which every view of the
 * models, and every readiness, is fetched again, since what may receive
 * restricted input has changed.
 */
export function useDeclarePolicy(): UseMutationResult<
  PortfolioEntry,
  ApiFailure,
  PolicyDeclaration
> {
  const client = useQueryClient();
  const scope = useScope();

  return useMutation<PortfolioEntry, ApiFailure, PolicyDeclaration>({
    mutationFn: ({ identifier, policy }) =>
      declareModelPolicy(identifier, policy, { base: scope.api }),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: scoped(scope, queryKeys.models) }),
        client.invalidateQueries({ queryKey: scoped(scope, ["readiness"]) }),
      ]);
    },
  });
}

/** Returns a change to the local portfolio, after which every view of the models is fetched again. */
export function usePortfolioChange(): UseMutationResult<
  PortfolioEntry | PortfolioRemoval,
  ApiFailure,
  PortfolioChange
> {
  const client = useQueryClient();
  const scope = useScope();

  return useMutation<PortfolioEntry | PortfolioRemoval, ApiFailure, PortfolioChange>({
    mutationFn: ({ identifier, add, force = false }) =>
      add
        ? addToPortfolio(identifier, { base: scope.api })
        : removeFromPortfolio(identifier, { force }, { base: scope.api }),
    onSettled: () => client.invalidateQueries({ queryKey: scoped(scope, queryKeys.models) }),
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
  const scope = useScope();
  const list = useList("workflows");
  const details = useQueries({
    queries: (list.data ?? []).map((summary) => ({
      queryKey: scoped(scope, queryKeys.detail("workflows", { id: summary.id }, null)),
      queryFn: ({ signal }: { readonly signal: AbortSignal }) =>
        fetchDetail(detailApiPath("workflows", { id: summary.id }, null, scope.api), { signal }),
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
  const scope = useScope();

  return useQuery<LiveRun[], ApiFailure>({
    queryKey: scoped(scope, queryKeys.liveList),
    queryFn: ({ signal }) => fetchLiveRuns({ signal, base: scope.api }),
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.state === "running") === true
        ? RUNNING_POLL_MS
        : IDLE_POLL_MS,
  });
}

/** Returns one live run as the server last described it. */
export function useLiveRun(handle: string): UseQueryResult<LiveRun, ApiFailure> {
  const scope = useScope();

  return useQuery<LiveRun, ApiFailure>({
    queryKey: scoped(scope, queryKeys.liveRun(handle)),
    queryFn: ({ signal }) => fetchLiveRun(handle, { signal, base: scope.api }),
  });
}

/** What starting a run takes: the workflow, and what it is given. */
/** Returns a start of a live run, after which the live runs are fetched again. */
export function useStartRun(): UseMutationResult<LiveRun, ApiFailure, RunStart> {
  const client = useQueryClient();
  const scope = useScope();

  return useMutation<LiveRun, ApiFailure, RunStart>({
    mutationFn: (start) => startRun(start, { base: scope.api }),
    onSuccess: (run) => {
      client.setQueryData(scoped(scope, queryKeys.liveRun(run.handle)), run);
    },
    onSettled: () => client.invalidateQueries({ queryKey: scoped(scope, queryKeys.liveList) }),
  });
}

/** Returns a start of trying one step alone, after which the live runs are fetched again. */
export function useTryStep(): UseMutationResult<LiveRun, ApiFailure, TrialStart> {
  const client = useQueryClient();
  const scope = useScope();

  return useMutation<LiveRun, ApiFailure, TrialStart>({
    mutationFn: (start) => startTrial(start, { base: scope.api }),
    onSuccess: (run) => {
      client.setQueryData(scoped(scope, queryKeys.liveRun(run.handle)), run);
    },
    onSettled: () => client.invalidateQueries({ queryKey: scoped(scope, queryKeys.liveList) }),
  });
}

/** Returns a way to ask a live run to stop. */
export function useCancelRun(): UseMutationResult<LiveRun, ApiFailure, string> {
  const client = useQueryClient();
  const scope = useScope();

  return useMutation<LiveRun, ApiFailure, string>({
    mutationFn: (handle) => cancelLiveRun(handle, { base: scope.api }),
    onSettled: () => client.invalidateQueries({ queryKey: scoped(scope, queryKeys.live) }),
  });
}

/** Returns a workflow's kept runs, newest first: the newest `RUNS_LISTED` of them. */
export function useWorkflowRuns(workflowId: string): UseQueryResult<RunSummary[], ApiFailure> {
  const scope = useScope();

  return useQuery<RunSummary[], ApiFailure>({
    queryKey: scoped(scope, queryKeys.workflowRuns(workflowId)),
    queryFn: ({ signal }) => fetchWorkflowRuns(workflowId, { signal, base: scope.api }),
  });
}

/** Returns one kept run with its steps; a kept run never changes. */
export function useRun(runId: string): UseQueryResult<RunDetail, ApiFailure> {
  const scope = useScope();

  return useQuery<RunDetail, ApiFailure>({
    queryKey: scoped(scope, queryKeys.run(runId)),
    queryFn: ({ signal }) => fetchRun(runId, { signal, base: scope.api }),
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
  sensitivity: Sensitivity | null = null,
): UseQueryResult<ModelSummary[], ApiFailure> {
  const scope = useScope();
  const key = JSON.stringify(requirements);

  return useQuery<ModelSummary[], ApiFailure>({
    queryKey: scoped(scope, queryKeys.matching(key, sensitivity)),
    queryFn: ({ signal }) => matchModels(requirements, { signal, base: scope.api }, sensitivity),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * Returns what Azathoth makes of a workflow document, as it is written. While
 * a changed document is asked about, the last answer stands.
 */
export function useWorkflowCheck(document: unknown): UseQueryResult<WorkflowCheck, ApiFailure> {
  const scope = useScope();
  const key = JSON.stringify(document);

  return useQuery<WorkflowCheck, ApiFailure>({
    queryKey: scoped(scope, queryKeys.check(key)),
    queryFn: ({ signal }) => checkWorkflow(document, { signal, base: scope.api }),
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
  {
    enabled = true,
    sensitivity = null,
  }: { readonly enabled?: boolean; readonly sensitivity?: Sensitivity | null } = {},
): UseQueryResult<WorkflowReadiness, ApiFailure> {
  const scope = useScope();
  const key = JSON.stringify(document);

  return useQuery<WorkflowReadiness, ApiFailure>({
    queryKey: scoped(scope, queryKeys.readiness(key, sensitivity)),
    queryFn: ({ signal }) => fetchReadiness(document, { signal, base: scope.api }, sensitivity),
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

/** One push: the remote's name, and what is pushed. */
export interface Push {
  readonly name: string;
  readonly selection: Selection;
}

/** Returns a push, after which every remote's status is asked again. */
export function usePush(): UseMutationResult<PushReport, ApiFailure, Push> {
  const client = useQueryClient();

  return useMutation<PushReport, ApiFailure, Push>({
    mutationFn: ({ name, selection }) => pushToRemote(name, selection),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.remotes }),
  });
}

/** One pull: the remote's name, what is pulled, and whether restricted benchmarks come too. */
export interface Pull {
  readonly name: string;
  readonly selection: Selection;
  readonly includeRestricted?: boolean;
}

/**
 * Returns a pull, after which every remote's status, and every workflow,
 * tool and benchmark in the editor's own instance, is fetched again, since
 * the pull may have saved revisions of any of them.
 */
export function usePull(): UseMutationResult<PullReport, ApiFailure, Pull> {
  const client = useQueryClient();

  return useMutation<PullReport, ApiFailure, Pull>({
    mutationFn: ({ name, selection, includeRestricted = false }) =>
      pullFromRemote(name, selection, { includeRestricted }),
    onSettled: async () => {
      await Promise.all(
        [queryKeys.remotes, ...KINDS.map((kind) => scoped(LOCAL_SCOPE, [kind]))].map((queryKey) =>
          client.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

/** Returns what a workflow's production runs now, or `null` when it is not in production. */
export function useProduction(
  workflowId: string,
): UseQueryResult<ProductionState | null, ApiFailure> {
  const scope = useScope();

  return useQuery<ProductionState | null, ApiFailure>({
    queryKey: scoped(scope, queryKeys.production(workflowId)),
    queryFn: ({ signal }) => fetchProduction(workflowId, { signal, base: scope.api }),
  });
}

/** Returns a workflow's production revisions, newest first, the active one marked. */
export function useProductionRevisions(
  workflowId: string,
): UseQueryResult<ProductionRevisionSummary[], ApiFailure> {
  const scope = useScope();

  return useQuery<ProductionRevisionSummary[], ApiFailure>({
    queryKey: scoped(scope, queryKeys.productionRevisions(workflowId)),
    queryFn: ({ signal }) => fetchProductionRevisions(workflowId, { signal, base: scope.api }),
  });
}

/** One change to a workflow's production: a promotion, or a rollback, to one revision or the last. */
export type ProductionChange =
  | { readonly promote: true; readonly experimentId?: string }
  | { readonly promote: false; readonly to?: string };

/**
 * Returns a change to a workflow's production, after which its production,
 * its revisions and its invocations are fetched again.
 */
export function useProductionChange(
  workflowId: string,
): UseMutationResult<ProductionRevisionSummary, ApiFailure, ProductionChange> {
  const client = useQueryClient();
  const scope = useScope();

  return useMutation<ProductionRevisionSummary, ApiFailure, ProductionChange>({
    mutationFn: (change) =>
      change.promote
        ? promoteWorkflow(
            workflowId,
            change.experimentId === undefined ? {} : { experimentId: change.experimentId },
            { base: scope.api },
          )
        : rollBackWorkflow(workflowId, change.to === undefined ? {} : { to: change.to }, {
            base: scope.api,
          }),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: scoped(scope, queryKeys.production(workflowId)) }),
        client.invalidateQueries({ queryKey: scoped(scope, queryKeys.invocations) }),
      ]);
    },
  });
}

/** Returns a workflow's invocations, newest first. */
export function useWorkflowInvocations(
  workflowId: string,
): UseQueryResult<InvocationSummary[], ApiFailure> {
  const scope = useScope();

  return useQuery<InvocationSummary[], ApiFailure>({
    queryKey: scoped(scope, queryKeys.workflowInvocations(workflowId)),
    queryFn: ({ signal }) => fetchWorkflowInvocations(workflowId, { signal, base: scope.api }),
  });
}

/** Returns one invocation, with its input, outcome and run. */
export function useInvocation(invocationId: string): UseQueryResult<InvocationDetail, ApiFailure> {
  const scope = useScope();

  return useQuery<InvocationDetail, ApiFailure>({
    queryKey: scoped(scope, queryKeys.invocation(invocationId)),
    queryFn: ({ signal }) => fetchInvocation(invocationId, { signal, base: scope.api }),
  });
}

/** Returns an invocation through production, as a live run, after which the live runs are fetched again. */
export function useInvoke(): UseMutationResult<LiveRun, ApiFailure, InvocationStart> {
  const client = useQueryClient();
  const scope = useScope();

  return useMutation<LiveRun, ApiFailure, InvocationStart>({
    mutationFn: (start) => startInvocation(start, { base: scope.api }),
    onSuccess: (run) => {
      client.setQueryData(scoped(scope, queryKeys.liveRun(run.handle)), run);
    },
    onSettled: () => client.invalidateQueries({ queryKey: scoped(scope, queryKeys.liveList) }),
  });
}

/** Returns a resume of an incomplete invocation, as a live run. */
export function useResumeInvocation(): UseMutationResult<LiveRun, ApiFailure, string> {
  const client = useQueryClient();
  const scope = useScope();

  return useMutation<LiveRun, ApiFailure, string>({
    mutationFn: (invocationId) => resumeInvocation(invocationId, { base: scope.api }),
    onSuccess: (run) => {
      client.setQueryData(scoped(scope, queryKeys.liveRun(run.handle)), run);
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: scoped(scope, queryKeys.liveList) }),
        client.invalidateQueries({ queryKey: scoped(scope, queryKeys.invocations) }),
      ]);
    },
  });
}

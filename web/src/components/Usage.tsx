import type { ReactNode } from "react";

import type { ModelUsage, ToolUsage } from "../api/types";
import { useAllowed } from "../permissions";
import { useModelUsage, useToolUsage } from "../queries";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";
import styles from "./Usage.module.css";

/** How many of a workflow's runs are listed; the rest are counted. */
export const RUNS_SHOWN = 5;

/** One kept run that used it, as a line of a usage. */
interface UsedRun {
  readonly runId: string;
  readonly startedAt: string;
  readonly detail: string;
}

/** One workflow that depends on it, as a usage shows it. */
interface UsedBy {
  readonly workflowId: string;
  readonly workflowName: string;
  readonly configured: boolean;
  readonly production: string | null;
  readonly runs: readonly UsedRun[];
}

/** Returns the first characters of an id, enough to tell steps apart. */
function short(id: string): string {
  return id.slice(0, 8);
}

/** Returns how many kept runs used it, in words. */
function runCount(count: number): string {
  return count === 1 ? "1 kept run used it" : `${String(count)} kept runs used it`;
}

/** Returns a model's usage as its workflows read. */
function modelUses(usage: ModelUsage): UsedBy[] {
  return usage.workflows.map((workflow) => ({
    workflowId: workflow.workflow_id,
    workflowName: workflow.workflow_name,
    configured: workflow.configured,
    production:
      workflow.production.length === 0
        ? null
        : `Production runs it at ${workflow.production
            .map((step) => `step ${short(step.step_id)}, as its ${step.role}`)
            .join("; ")}`,
    runs: workflow.runs.map((run) => ({
      runId: run.run_id,
      startedAt: run.started_at,
      detail: run.steps
        .map((step) => `step ${short(step.step_id)}, attempt ${String(step.attempt_number)}`)
        .join("; "),
    })),
  }));
}

/** Returns a tool's usage as its workflows read. */
function toolUses(usage: ToolUsage): UsedBy[] {
  return usage.workflows.map((workflow) => ({
    workflowId: workflow.workflow_id,
    workflowName: workflow.workflow_name,
    configured: workflow.configured,
    production: workflow.production ? "Production requires it" : null,
    runs: workflow.runs.map((run) => ({
      runId: run.run_id,
      startedAt: run.started_at,
      detail: run.executions
        .map((execution) => `version ${execution.tool_version}, in ${execution.runtime}`)
        .join("; "),
    })),
  }));
}

/** Each workflow that depends on it, with its configuration, its production and its runs. */
function UsedByList({ uses }: { readonly uses: readonly UsedBy[] }) {
  return (
    <ul className={styles.workflows}>
      {uses.map((use) => {
        const newest = [...use.runs].reverse().slice(0, RUNS_SHOWN);

        return (
          <li key={use.workflowId} className={styles.workflow}>
            <InstanceLink className={styles.name} to={`/workflows/${use.workflowId}`}>
              {use.workflowName}
            </InstanceLink>
            <ul className={styles.facts}>
              <li>
                {use.configured ? "Its latest revision names it" : "Its latest revision doesn't"}
              </li>
              {use.production !== null && <li>{use.production}</li>}
              <li>{use.runs.length === 0 ? "No kept run used it" : runCount(use.runs.length)}</li>
            </ul>
            {newest.length > 0 && (
              <ol className={styles.runs} aria-label={`Runs of ${use.workflowName} that used it`}>
                {newest.map((run) => (
                  <li key={run.runId}>
                    <InstanceLink className={styles.run} to={`/runs/${run.runId}`}>
                      <RelativeTime iso={run.startedAt} />
                    </InstanceLink>{" "}
                    <span className={styles.detail}>{run.detail}</span>
                  </li>
                ))}
                {use.runs.length > RUNS_SHOWN && (
                  <li className={styles.detail}>and {use.runs.length - RUNS_SHOWN} earlier</li>
                )}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The section a usage is shown in, whatever state its answer is in. */
function UsageSection({
  pending,
  error,
  inProduction,
  uses,
  noun,
}: {
  readonly pending: boolean;
  readonly error: string | null;
  readonly inProduction: boolean;
  readonly uses: readonly UsedBy[];
  readonly noun: string;
}) {
  let body: ReactNode;

  if (pending) {
    body = <p className={styles.quiet}>Looking for where it&apos;s used…</p>;
  } else if (error !== null) {
    body = (
      <Notice title="Couldn't say where it's used" tone="note">
        <p>{error}</p>
      </Notice>
    );
  } else if (uses.length === 0) {
    body = (
      <p className={styles.quiet}>
        No workflow names this {noun}, no production uses it, and no kept run used it.
      </p>
    );
  } else {
    body = (
      <>
        <p className={styles.quiet}>
          {inProduction ? "Active production uses it." : "No active production uses it."} Each
          workflow that names it, or whose kept runs used it:
        </p>
        <UsedByList uses={uses} />
      </>
    );
  }

  return (
    <section className={styles.usage} aria-labelledby="usage-heading">
      <h2 id="usage-heading" className={styles.heading}>
        Where it&apos;s used
      </h2>
      {body}
    </section>
  );
}

/** Returns whether a usage may be read: it reads the catalog and the runs (ADR 0015). */
function useUsageReadable(): boolean {
  const catalog = useAllowed("read_catalog");
  const runs = useAllowed("read_runs");

  return catalog.allowed && runs.allowed;
}

function ModelUsageShown({ identifier }: { readonly identifier: string }) {
  const usage = useModelUsage(identifier);

  return (
    <UsageSection
      pending={usage.isPending}
      error={usage.isError ? usage.error.message : null}
      inProduction={usage.data?.in_production ?? false}
      uses={usage.data === undefined ? [] : modelUses(usage.data)}
      noun="model"
    />
  );
}

function ToolUsageShown({ toolId }: { readonly toolId: string }) {
  const usage = useToolUsage(toolId);

  return (
    <UsageSection
      pending={usage.isPending}
      error={usage.isError ? usage.error.message : null}
      inProduction={usage.data?.in_production ?? false}
      uses={usage.data === undefined ? [] : toolUses(usage.data)}
      noun="tool"
    />
  );
}

/**
 * Where one exact model is used: each workflow whose latest revision names
 * it, the production steps that run it and as what, and the kept runs that
 * called it (ADR 0015). Where the catalog and the runs may not both be
 * read, it is not there, and nothing is asked.
 */
export function ModelUsageSection({ identifier }: { readonly identifier: string }) {
  return useUsageReadable() ? <ModelUsageShown identifier={identifier} /> : null;
}

/** Where one tool, in any of its versions, is used, as a model's is. */
export function ToolUsageSection({ toolId }: { readonly toolId: string }) {
  return useUsageReadable() ? <ToolUsageShown toolId={toolId} /> : null;
}

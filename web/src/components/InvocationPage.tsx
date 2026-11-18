import { useNavigate, useParams } from "react-router";

import type { InvocationDetail, InvocationRun } from "../api/types";
import { callerName, INVOCATION_STATUS_NAMES, SENSITIVITY_NAMES } from "../invocations";
import { useDetail, useInvocation, useResumeInvocation } from "../queries";
import { duration } from "../running";
import { usePage } from "../scope";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import { Command } from "./Command";
import styles from "./InvocationPage.module.css";
import { InstanceLink } from "./InstanceLink";
import { JsonBlock } from "./JsonBlock";
import page from "./LiveRun.module.css";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";

const MISSING_CODES = new Set(["not_found", "invalid_argument"]);

function Crumbs({
  workflowId,
  name,
}: {
  readonly workflowId: string | null;
  readonly name: string;
}) {
  return (
    <nav className={page.crumbs} aria-label="Breadcrumb">
      <InstanceLink to="/workflows">Workflows</InstanceLink>
      <span aria-hidden="true">/</span>
      {workflowId === null ? (
        <span>{name}</span>
      ) : (
        <>
          <InstanceLink to={`/workflows/${workflowId}`}>{name}</InstanceLink>
          <span aria-hidden="true">/</span>
          <InstanceLink to={`/workflows/${workflowId}/production`}>Production</InstanceLink>
        </>
      )}
      <span aria-hidden="true">/</span>
      <span aria-current="page">Invocation</span>
    </nav>
  );
}

/** Returns how often a run was resumed, as a sentence ends it. */
function resumedOf(resumes: number): string {
  if (resumes === 0) {
    return "it hasn’t been resumed";
  }
  return `it was resumed ${resumes === 1 ? "once" : `${String(resumes)} times`}`;
}

/** The run behind an invocation: where it is kept once finished, or how far it got. */
function RunBehind({ run }: { readonly run: InvocationRun | null }) {
  if (run === null) {
    return <p className={page.quiet}>Production refused it before it ran, so it has no run.</p>;
  }

  if (!run.finished) {
    return (
      <div className={styles.run}>
        <p>Its run hasn’t finished; {resumedOf(run.resumes)}.</p>
        <p className={page.quiet}>Resume it, and it carries on from where it stopped.</p>
      </div>
    );
  }

  const steps = `${String(run.steps.length)} ${run.steps.length === 1 ? "step" : "steps"}`;
  const facts = [
    ...(run.workflow_revision === null ? [] : [`revision ${String(run.workflow_revision)}`]),
    steps,
    ...(run.started_at === null ? [] : [duration(run.started_at, run.completed_at)]),
  ];

  return (
    <div className={styles.run}>
      <p className={page.kept}>
        Kept as{" "}
        <InstanceLink className={page.back} to={`/runs/${run.run_id}`}>
          run <code>{run.run_id}</code>
        </InstanceLink>
        .
      </p>
      <p className={page.quiet}>
        {facts.join(" · ")}
        {run.resumes > 0 && `; ${resumedOf(run.resumes)}`}
      </p>
    </div>
  );
}

/** One invocation, once it has loaded. */
function Invocation({ invocation }: { readonly invocation: InvocationDetail }) {
  const navigate = useNavigate();
  const pageOf = usePage();
  const detail = useDetail("workflows", { id: invocation.workflow_id }, null);
  const resume = useResumeInvocation();
  const name = detail.data?.name ?? "This workflow";
  const status = INVOCATION_STATUS_NAMES[invocation.status];
  const incomplete = invocation.status === "incomplete";

  return (
    <div className={page.page}>
      <Crumbs workflowId={invocation.workflow_id} name={name} />
      <header className={page.header}>
        <div className={page.titles}>
          <p className={page.eyebrow}>Invocation in production</p>
          <h1 className={page.title}>{name}</h1>
          <p className={page.status}>
            <span className={page.pill} data-state={invocation.status}>
              {status}
            </span>
            <span className={page.facts}>
              <RelativeTime iso={invocation.created_at} />
            </span>
          </p>
        </div>
        <div className={page.actions}>
          {incomplete ? (
            <ActionButton
              action="invoke"
              subject={invocation.workflow_id}
              type="button"
              className={buttons.primary}
              disabled={resume.isPending}
              aria-busy={resume.isPending}
              onClick={() => {
                resume.mutate(invocation.invocation_id, {
                  onSuccess: (run) => {
                    void navigate(pageOf(`/live/${run.handle}`));
                  },
                });
              }}
            >
              {resume.isPending ? "Resuming…" : "Resume"}
            </ActionButton>
          ) : (
            <InstanceLink
              className={buttons.primary}
              to={`/workflows/${invocation.workflow_id}/invoke`}
            >
              Invoke again
            </InstanceLink>
          )}
        </div>
      </header>
      <Command command={invocation.command} />
      {resume.isError && (
        <Notice title="The invocation didn't resume">
          <p>{resume.error.message}</p>
        </Notice>
      )}
      {invocation.error !== null && (
        <Notice title="The invocation failed">
          <p>{invocation.error.message}</p>
          <p>
            <code>{invocation.error.code}</code>
          </p>
        </Notice>
      )}
      <ul className={styles.about} aria-label="About this invocation">
        <li>
          <span className={styles.name}>Caller</span>
          <span className={styles.value}>{callerName(invocation.caller_metadata)}</span>
        </li>
        <li>
          <span className={styles.name}>Label</span>
          <span className={styles.label} data-sensitivity={invocation.sensitivity}>
            {SENSITIVITY_NAMES[invocation.sensitivity]}
          </span>
        </li>
        <li>
          <span className={styles.name}>Idempotency key</span>
          <span className={styles.value}>
            {invocation.idempotency_key === null ? (
              "None named"
            ) : (
              <code>{invocation.idempotency_key}</code>
            )}
          </span>
        </li>
      </ul>
      <div className={page.pair}>
        <section className={page.outcome} aria-labelledby="input-heading">
          <h2 id="input-heading" className={page.sectionTitle}>
            Input
          </h2>
          <JsonBlock value={invocation.input} label="The invocation's input, as JSON" />
        </section>
        <section className={page.outcome} aria-labelledby="result-heading">
          <h2 id="result-heading" className={page.sectionTitle}>
            Result
          </h2>
          {invocation.status === "succeeded" ? (
            <JsonBlock value={invocation.result} label="The invocation's result, as JSON" />
          ) : (
            <p className={page.quiet}>{incomplete ? "It has none yet." : "It produced none."}</p>
          )}
        </section>
      </div>
      <section className={page.outcome} aria-labelledby="run-heading">
        <h2 id="run-heading" className={page.sectionTitle}>
          Its run
        </h2>
        <RunBehind run={invocation.run} />
      </section>
    </div>
  );
}

/**
 * `/invocations/:invocationId`: one invocation production kept, as
 * `invocation show` shows it: how it ended, who made it, its key, its
 * input and result, and its run, or Resume while it is incomplete
 * (ADR 0010).
 */
export function InvocationPage() {
  const { invocationId = "" } = useParams();
  const invocation = useInvocation(invocationId);

  if (invocation.isPending) {
    return (
      <div className={page.page}>
        <Crumbs workflowId={null} name="A workflow" />
        <p className={page.quiet} role="status">
          Loading this invocation…
        </p>
      </div>
    );
  }

  if (invocation.isError) {
    return (
      <div className={page.page}>
        <Crumbs workflowId={null} name="A workflow" />
        <Notice
          title={
            MISSING_CODES.has(invocation.error.code)
              ? "No invocation at this address"
              : "Couldn't load this invocation"
          }
        >
          <p>{invocation.error.message}</p>
          <p>
            <InstanceLink className={page.back} to="/workflows">
              Back to workflows
            </InstanceLink>
          </p>
        </Notice>
      </div>
    );
  }

  return <Invocation invocation={invocation.data} />;
}

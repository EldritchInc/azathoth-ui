import { useState } from "react";

import type { ApiFailure } from "../api/client";
import type { ProductionRevisionSummary, ProductionStepModels } from "../api/types";
import { modelPath } from "../models";
import { useProduction, useProductionChange, useProductionRevisions } from "../queries";
import { LOCAL_SCOPE, useScope } from "../scope";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import styles from "./ProductionTab.module.css";
import { RelativeTime } from "./RelativeTime";

/** What a confirm is about: promoting the latest revision, or rolling back to one. */
type Confirming =
  | { readonly kind: "promote" }
  | {
      readonly kind: "rollback";
      readonly target: ProductionRevisionSummary | null;
      readonly to?: string;
    };

const UNAUTHORIZED_MODEL = /uses (\S+), which the portfolio no longer authorizes/;

/** Returns how a confirm names the instance a change is made on. */
function instanceLabel(name: string): string {
  return name === LOCAL_SCOPE.name ? "your local instance" : name;
}

/** Returns a revision's id as it is shown: its start, the whole on hover. */
function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Each prompt step's models, in the order production tries them. */
function StepModels({ steps }: { readonly steps: readonly ProductionStepModels[] }) {
  if (steps.length === 0) {
    return <p className={styles.quiet}>No prompt steps: it runs on its tools alone.</p>;
  }

  return (
    <ul className={styles.models}>
      {steps.map((step) => (
        <li key={step.step_id}>
          <span className={styles.step} title={step.step_id}>
            Step {shortId(step.step_id)}
          </span>
          <code className={styles.model}>{step.primary}</code>
          {step.substitutes.map((substitute) => (
            <span key={substitute} className={styles.substitute}>
              then {substitute}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** Who made a production revision, or that nobody known did. */
function Who({ revision }: { readonly revision: ProductionRevisionSummary }) {
  return revision.author === null ? (
    <span className={styles.quiet}>by someone unknown</span>
  ) : (
    <span>
      by <span className={styles.author}>{revision.author.name}</span>
    </span>
  );
}

/** What one production revision did: promoted a revision, or rolled back to one. */
function deed(revision: ProductionRevisionSummary): string {
  const number =
    revision.workflow_revision === null ? "" : ` revision ${String(revision.workflow_revision)}`;

  return revision.restores === null ? `Promoted${number}` : `Rolled back to${number}`;
}

/** Why a change was refused, as Azathoth said, with a link to a model it names. */
function Refused({ failure }: { readonly failure: ApiFailure }) {
  const model =
    failure.code === "model_not_authorized" ? UNAUTHORIZED_MODEL.exec(failure.message) : null;

  return (
    <Notice title="Production didn't change">
      <p>{failure.message}</p>
      {model?.[1] !== undefined && (
        <p>
          Authorize <InstanceLink to={modelPath(model[1])}>{model[1]}</InstanceLink> in the
          portfolio again first.
        </p>
      )}
    </Notice>
  );
}

/**
 * `/workflows/:id/production`: what production runs now, every revision
 * that made it run, and promoting and rolling back, each confirmed and
 * naming the instance it changes (ADR 0010).
 */
export function ProductionTab({
  workflowId,
  name,
  latest,
}: {
  readonly workflowId: string;
  readonly name: string;
  readonly latest: number;
}) {
  const scope = useScope();
  const production = useProduction(workflowId);
  const revisions = useProductionRevisions(workflowId);
  const change = useProductionChange(workflowId);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const where = instanceLabel(scope.name);
  const history = revisions.data ?? [];
  const activeIndex = history.findIndex((revision) => revision.active);
  const previous = activeIndex === -1 ? null : (history[activeIndex + 1] ?? null);

  if (production.isPending) {
    return (
      <p className={styles.quiet} role="status">
        Asking what production runs…
      </p>
    );
  }

  if (production.isError) {
    return <Notice title="Couldn't ask what production runs">{production.error.message}</Notice>;
  }

  const state = production.data;

  const confirm = (() => {
    if (confirming === null) {
      return null;
    }

    const promoting = confirming.kind === "promote";
    const target = confirming.kind === "rollback" ? confirming.target : null;
    const to = confirming.kind === "rollback" ? confirming.to : undefined;
    const number = target === null ? null : target.workflow_revision;
    const question = promoting
      ? `Promote revision ${String(latest)} of ${name} on ${where}?`
      : `Roll ${name} on ${where} back to${
          number === null ? " the revision before" : ` revision ${String(number)}`
        }?`;

    return (
      <div className={styles.confirm} role="group" aria-label="Confirm">
        <p className={styles.question}>{question}</p>
        <p className={styles.quiet}>
          {promoting
            ? "Every caller of this workflow gets its latest revision from now on, on the models a run here chooses."
            : "Production runs that revision again, exactly as it ran:"}
        </p>
        {target !== null && <StepModels steps={target.steps} />}
        <div className={styles.buttons}>
          <ActionButton
            action="promote"
            subject={workflowId}
            type="button"
            className={buttons.primary}
            disabled={change.isPending}
            aria-busy={change.isPending}
            onClick={() => {
              change.mutate(
                promoting
                  ? { promote: true }
                  : to === undefined
                    ? { promote: false }
                    : { promote: false, to },
                {
                  onSettled: () => {
                    setConfirming(null);
                  },
                },
              );
            }}
          >
            {promoting ? "Promote" : "Roll back"}
          </ActionButton>
          <button
            type="button"
            className={buttons.quiet}
            disabled={change.isPending}
            onClick={() => {
              setConfirming(null);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  })();

  return (
    <div className={styles.tab}>
      <section className={styles.section} aria-labelledby="production-now">
        <div className={styles.head}>
          <h2 id="production-now" className={styles.title}>
            In production
          </h2>
          <div className={styles.buttons}>
            <ActionButton
              action="promote"
              subject={workflowId}
              type="button"
              className={buttons.primary}
              disabled={change.isPending}
              onClick={() => {
                change.reset();
                setConfirming({ kind: "promote" });
              }}
            >
              Promote…
            </ActionButton>
            {state !== null && previous !== null && (
              <ActionButton
                action="promote"
                subject={workflowId}
                type="button"
                className={buttons.quiet}
                disabled={change.isPending}
                onClick={() => {
                  change.reset();
                  setConfirming({ kind: "rollback", target: previous });
                }}
              >
                Roll back…
              </ActionButton>
            )}
          </div>
        </div>
        {confirm}
        {change.isError && <Refused failure={change.error} />}
        {change.isSuccess && (
          <Notice title={`${deed(change.data)}.`} tone="note">
            <p>Production runs it now.</p>
          </Notice>
        )}
        {state === null ? (
          <p className={styles.quiet}>
            {name} isn&apos;t in production on {where}. Promote it, and its callers get its latest
            revision.
          </p>
        ) : (
          <>
            <dl className={styles.facts}>
              <div>
                <dt>Workflow</dt>
                <dd>
                  {state.workflow_revision === null
                    ? "An unnumbered revision"
                    : `Revision ${String(state.workflow_revision)}`}
                </dd>
              </div>
              {state.revision !== null && (
                <>
                  <div>
                    <dt>How</dt>
                    <dd>
                      {deed(state.revision)} <Who revision={state.revision} />
                    </dd>
                  </div>
                  <div>
                    <dt>When</dt>
                    <dd>
                      <RelativeTime iso={state.revision.created_at} />
                    </dd>
                  </div>
                </>
              )}
            </dl>
            <StepModels steps={state.steps} />
          </>
        )}
      </section>
      <section className={styles.section} aria-labelledby="production-history">
        <h2 id="production-history" className={styles.title}>
          Production history
        </h2>
        {revisions.isError && (
          <Notice title="Couldn't list production's revisions">{revisions.error.message}</Notice>
        )}
        {revisions.isSuccess && history.length === 0 && (
          <p className={styles.quiet}>Nothing has been promoted yet.</p>
        )}
        {history.length > 0 && (
          <ol className={styles.history}>
            {history.map((revision) => (
              <li key={revision.revision_id} className={styles.entry} data-active={revision.active}>
                <div className={styles.what}>
                  <span className={styles.deed}>{deed(revision)}</span> <Who revision={revision} />{" "}
                  <span className={styles.quiet}>
                    <RelativeTime iso={revision.created_at} />
                  </span>
                  <code className={styles.id} title={revision.revision_id}>
                    {shortId(revision.revision_id)}
                  </code>
                </div>
                {revision.active ? (
                  <span className={styles.active}>Active</span>
                ) : (
                  <ActionButton
                    action="promote"
                    subject={workflowId}
                    type="button"
                    className={buttons.quiet}
                    disabled={change.isPending}
                    onClick={() => {
                      change.reset();
                      setConfirming({
                        kind: "rollback",
                        target: revision,
                        to: revision.revision_id,
                      });
                    }}
                  >
                    Roll back to this
                  </ActionButton>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

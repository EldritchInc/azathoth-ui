import { useState } from "react";

import type { ExperimentDetail } from "../api/types";
import { usePromotability, useProductionChange } from "../queries";
import { instanceLabel, useScope } from "../scope";
import { resource } from "../permissions";
import { ActionButton } from "./ActionButton";
import styles from "./Benchmarks.module.css";
import buttons from "./Buttons.module.css";
import { Command } from "./Command";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import production from "./ProductionTab.module.css";

/**
 * Promoting an experiment's winner (ADR 0013): first whether it can still
 * be promoted, and why not; then, confirmed and naming the instance it
 * changes and the model each step will be pinned to, the `promote` action;
 * then a way to the workflow's production.
 */
export function PromoteWinner({ experiment }: { readonly experiment: ExperimentDetail }) {
  const scope = useScope();
  const promotability = usePromotability(experiment.experiment_id);
  const change = useProductionChange(experiment.workflow_id);
  const [confirming, setConfirming] = useState(false);
  const where = instanceLabel(scope.name);
  const winner =
    experiment.candidates.find(
      (candidate) => candidate.observation_id === experiment.winner_observation_id,
    ) ??
    experiment.candidates.find((candidate) => candidate.rank === 1) ??
    null;
  const promotable = promotability.data?.promotable === true;
  const refusal =
    promotability.data !== undefined && !promotability.data.promotable && !change.isSuccess
      ? promotability.data
      : null;

  return (
    <section className={styles.section} aria-label="Promote">
      <h2 className={styles.heading}>Promote the winner</h2>
      <p className={styles.quiet}>
        Production pins each of the workflow’s steps to the model the winner ran on, and every
        caller gets it from then on.
      </p>
      <div className={production.buttons}>
        <ActionButton
          action="promote"
          subject={resource("workflow", experiment.workflow_id)}
          type="button"
          className={buttons.primary}
          disabled={!promotable || confirming || change.isPending}
          onClick={() => {
            change.reset();
            setConfirming(true);
          }}
        >
          Promote the winner…
        </ActionButton>
      </div>
      {promotability.isPending && (
        <p className={styles.quiet} role="status">
          Asking whether the winner can still be promoted…
        </p>
      )}
      {promotability.isError && (
        <Notice title="Couldn't ask whether it can be promoted">
          <p>{promotability.error.message}</p>
        </Notice>
      )}
      {refusal !== null && (
        <Notice title="The winner can't be promoted">
          <p>{refusal.reason ?? "Azathoth gave no reason."}</p>
          {refusal.code !== null && (
            <p>
              <code>{refusal.code}</code>
            </p>
          )}
        </Notice>
      )}
      {confirming && (
        <div className={production.confirm} role="group" aria-label="Confirm">
          <p className={production.question}>
            Promote the winner of this experiment for {experiment.workflow_name} on {where}?
          </p>
          {winner === null || winner.steps.length === 0 ? (
            <p className={production.quiet}>
              The winner’s runs are no longer kept, so the models it pins can’t be told here.
            </p>
          ) : (
            <>
              <p className={production.quiet}>Production runs each step on:</p>
              <ul className={production.models}>
                {winner.steps.map((step) => (
                  <li key={step.step_id}>
                    <span className={production.step} title={step.step_id}>
                      Step {step.step_id.slice(0, 8)}
                    </span>
                    {step.model === null ? (
                      <span className={production.quiet}>no model</span>
                    ) : (
                      <code className={production.model}>{step.model}</code>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className={production.buttons}>
            <ActionButton
              action="promote"
              subject={resource("workflow", experiment.workflow_id)}
              type="button"
              className={buttons.primary}
              disabled={change.isPending}
              aria-busy={change.isPending}
              onClick={() => {
                change.mutate(
                  { promote: true, experimentId: experiment.experiment_id },
                  {
                    onSettled: () => {
                      setConfirming(false);
                    },
                  },
                );
              }}
            >
              Promote
            </ActionButton>
            <button
              type="button"
              className={buttons.quiet}
              disabled={change.isPending}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {change.isError && (
        <Notice title="Production didn't change">
          <p>{change.error.message}</p>
        </Notice>
      )}
      {change.isSuccess && (
        <Notice title="The winner is in production now." tone="note">
          <p>
            <InstanceLink
              className={styles.link}
              to={`/workflows/${encodeURIComponent(experiment.workflow_id)}/production`}
            >
              Open the Production tab
            </InstanceLink>
          </p>
        </Notice>
      )}
      {promotability.data !== undefined && <Command command={promotability.data.command} />}
    </section>
  );
}

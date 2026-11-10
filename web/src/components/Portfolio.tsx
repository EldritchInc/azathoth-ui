import type { UseMutationResult } from "@tanstack/react-query";
import { Link } from "react-router";

import type { ApiFailure } from "../api/client";
import {
  isProductionDependent,
  type ModelSummary,
  type PortfolioEntry,
  type PortfolioRemoval,
  type ProductionDependent,
} from "../api/types";
import { nameOf } from "../models";
import type { PortfolioChange } from "../queries";
import buttons from "./Buttons.module.css";
import { Notice } from "./Notice";
import styles from "./Portfolio.module.css";

/** A change to the local portfolio, as `usePortfolioChange` makes it. */
export type Change = UseMutationResult<
  PortfolioEntry | PortfolioRemoval,
  ApiFailure,
  PortfolioChange
>;

function dependentsOf(failure: ApiFailure): ProductionDependent[] {
  const { dependents } = failure.details;

  return Array.isArray(dependents) ? dependents.filter(isProductionDependent) : [];
}

/**
 * The switch that adds a model to the local portfolio, or removes it. It
 * waits, turned neither way, while its change is made.
 */
export function PortfolioToggle({
  model,
  change,
}: {
  readonly model: ModelSummary;
  readonly change: Change;
}) {
  const changing = change.isPending && change.variables.identifier === model.identifier;

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={model.authorized}
      aria-busy={changing}
      disabled={changing}
      title={
        model.authorized
          ? "In your local portfolio: workflows here may use it"
          : "Add it to your local portfolio"
      }
      onClick={() => {
        change.mutate({ identifier: model.identifier, add: !model.authorized });
      }}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className="visually-hidden">{nameOf(model)} in your local portfolio</span>
    </button>
  );
}

/**
 * What became of the last change to the local portfolio, when it did not
 * go through: why, and for a model this instance's production uses, the
 * workflows that use it and a way to remove it all the same.
 */
export function PortfolioOutcome({
  change,
  models,
}: {
  readonly change: Change;
  readonly models: readonly ModelSummary[];
}) {
  if (change.status !== "error") {
    return null;
  }

  const { error, variables } = change;
  const model = models.find((each) => each.identifier === variables.identifier);
  const name = model === undefined ? variables.identifier : nameOf(model);

  if (error.code === "model_in_use" && !variables.add) {
    const dependents = dependentsOf(error);

    return (
      <Notice title={`${name} is used by production in this local instance`}>
        <p>
          Removing it stops these steps running here. Nothing changes on a shared server, whose
          models are its own.
        </p>
        <ul className={styles.dependents}>
          {dependents.map((dependent) => (
            <li key={dependent.workflow_id}>
              <Link to={`/workflows/${dependent.workflow_id}`}>{dependent.workflow_name}</Link>
              <span className={styles.steps}>
                {dependent.steps.length === 1
                  ? "1 step"
                  : `${String(dependent.steps.length)} steps`}
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button
            type="button"
            className={buttons.danger}
            onClick={() => {
              change.mutate({ identifier: variables.identifier, add: false, force: true });
            }}
          >
            Remove anyway
          </button>
          <button
            type="button"
            className={buttons.quiet}
            onClick={() => {
              change.reset();
            }}
          >
            Keep it
          </button>
        </div>
      </Notice>
    );
  }

  return (
    <Notice title={variables.add ? `Couldn't add ${name}` : `Couldn't remove ${name}`}>
      <p>{error.message}</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={buttons.quiet}
          onClick={() => {
            change.reset();
          }}
        >
          Dismiss
        </button>
      </div>
    </Notice>
  );
}

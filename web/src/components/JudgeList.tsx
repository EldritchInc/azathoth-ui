import { useId, useState, type ReactNode } from "react";

import type { JudgeSummary, ModelSummary } from "../api/types";
import { modelPath, nameOf } from "../models";
import { useJudgeChange, useJudges, useModels } from "../queries";
import { instanceLabel, useScope } from "../scope";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import { Command } from "./Command";
import { Skeleton } from "./ComponentList";
import list from "./ComponentList.module.css";
import { InstanceLink } from "./InstanceLink";
import styles from "./JudgeList.module.css";
import { Notice } from "./Notice";

/** The command that lists the rotation, as Azathoth names it. */
const LIST_COMMAND = "azathoth judge list";

/** Returns how a judge is named: the catalog's name for its model, or its identifier. */
function judgeName(judge: JudgeSummary, models: readonly ModelSummary[]): string {
  const model = models.find((each) => each.identifier === judge.identifier);

  return model === undefined ? judge.identifier : nameOf(model);
}

function JudgeRow({
  judge,
  name,
  removing,
  onRemove,
}: {
  readonly judge: JudgeSummary;
  readonly name: string;
  readonly removing: boolean;
  readonly onRemove: () => void;
}) {
  return (
    <tr>
      <td className={styles.position}>{judge.position}</td>
      <td className={list.name}>
        <div className={list.nameStack}>
          <InstanceLink className={list.link} to={modelPath(judge.identifier)}>
            {name}
          </InstanceLink>
          <code className={styles.identifier}>{judge.identifier}</code>
        </div>
      </td>
      <td>
        <span className={styles.state} data-authorized={judge.authorized}>
          {judge.authorized ? "Authorized" : "Not authorized: never asked to judge"}
        </span>
      </td>
      <td>
        <ActionButton
          action="manage_judges"
          subject={judge.identifier}
          type="button"
          className={buttons.quiet}
          disabled={removing}
          aria-busy={removing}
          onClick={onRemove}
        >
          Remove <span className="visually-hidden">{name}</span>
        </ActionButton>
      </td>
    </tr>
  );
}

/**
 * The form that appends a judge: one of the served models the portfolio
 * authorizes that is not a judge yet, the first of them unless another is chosen.
 */
function AddJudge({
  judges,
  models,
}: {
  readonly judges: readonly JudgeSummary[];
  readonly models: readonly ModelSummary[];
}) {
  const change = useJudgeChange();
  const [chosen, setChosen] = useState("");
  const field = useId();
  const candidates = models.filter(
    (model) => model.authorized && !judges.some((judge) => judge.identifier === model.identifier),
  );
  const identifier = candidates.some((model) => model.identifier === chosen)
    ? chosen
    : (candidates[0]?.identifier ?? "");
  const failed = change.isError && change.variables.add ? change.error : null;

  if (candidates.length === 0) {
    return (
      <p className={styles.quiet}>
        <span>
          {models.some((model) => model.authorized)
            ? "Every authorized model is a judge already."
            : "No served model is authorized here yet."}
        </span>{" "}
        <span>
          <InstanceLink to="/models">Authorize a model</InstanceLink> to make it a judge.
        </span>
      </p>
    );
  }

  return (
    <>
      <form
        className={styles.form}
        aria-label="Add a judge"
        onSubmit={(event) => {
          event.preventDefault();
          change.mutate({ identifier, add: true });
        }}
      >
        <label className={styles.field} htmlFor={field}>
          Model
          <select
            id={field}
            className={styles.select}
            value={identifier}
            onChange={(event) => {
              setChosen(event.target.value);
            }}
          >
            {candidates.map((model) => (
              <option key={model.identifier} value={model.identifier}>
                {nameOf(model)}
              </option>
            ))}
          </select>
        </label>
        <ActionButton
          action="manage_judges"
          subject={identifier}
          type="submit"
          className={buttons.primary}
          disabled={change.isPending}
          aria-busy={change.isPending}
        >
          Add judge
        </ActionButton>
      </form>
      {failed !== null && <Notice title="Couldn't add the judge">{failed.message}</Notice>}
    </>
  );
}

/**
 * `/judges`: the rotation of models that judge a benchmark's semantic
 * cases, in the order they are tried; adding one, and removing one once
 * it is confirmed, naming the instance it changes (ADR 0012).
 */
export function JudgeList() {
  const scope = useScope();
  const judges = useJudges();
  const models = useModels();
  const change = useJudgeChange();
  const [confirming, setConfirming] = useState<JudgeSummary | null>(null);
  const catalog = models.data?.items ?? [];
  const removingId = change.isPending && !change.variables.add ? change.variables.identifier : null;
  const removalFailed = change.isError && !change.variables.add ? change.error : null;

  let body: ReactNode;

  if (judges.isPending) {
    body = <Skeleton label="Loading judges" />;
  } else if (judges.isError) {
    body = <Notice title="Couldn't list the judges">{judges.error.message}</Notice>;
  } else if (judges.data.length === 0) {
    body = (
      <div className={list.empty}>
        <p className={list.emptyTitle}>No judge yet</p>
        <p className={list.emptyText}>
          A benchmark&apos;s semantic cases are judged by a model. Add one of the models this
          instance authorizes below; a second is tried when the first can&apos;t answer.
        </p>
      </div>
    );
  } else {
    body = (
      <table className={list.table}>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Model</th>
            <th scope="col">Portfolio</th>
            <th scope="col">
              <span className="visually-hidden">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {judges.data.map((judge) => (
            <JudgeRow
              key={judge.identifier}
              judge={judge}
              name={judgeName(judge, catalog)}
              removing={removingId === judge.identifier}
              onRemove={() => {
                setConfirming(judge);
              }}
            />
          ))}
        </tbody>
      </table>
    );
  }

  const confirmName = confirming === null ? null : judgeName(confirming, catalog);

  return (
    <div className={list.page}>
      <header className={list.header}>
        <div className={list.titles}>
          <h1 className={list.title}>Judges</h1>
          <p className={list.lead}>
            The models that judge a benchmark&apos;s semantic cases, tried in this order. A judge
            the portfolio no longer authorizes is kept in its place, but never asked.
          </p>
        </div>
      </header>
      {body}
      {confirming !== null && confirmName !== null && (
        <div className={styles.confirm} role="group" aria-label="Remove judge">
          <p className={styles.question}>
            Remove {confirmName} from the judges on {instanceLabel(scope.name)}?
          </p>
          <p className={styles.quiet}>Each judge after it moves up one place.</p>
          <div className={styles.actions}>
            <ActionButton
              action="manage_judges"
              subject={confirming.identifier}
              type="button"
              className={buttons.danger}
              onClick={() => {
                change.mutate({ identifier: confirming.identifier, add: false });
                setConfirming(null);
              }}
            >
              Remove
            </ActionButton>
            <button
              type="button"
              className={buttons.quiet}
              onClick={() => {
                setConfirming(null);
              }}
            >
              Keep it
            </button>
          </div>
        </div>
      )}
      {removalFailed !== null && (
        <Notice title="Couldn't remove the judge">{removalFailed.message}</Notice>
      )}
      {judges.isSuccess && models.isSuccess && (
        <AddJudge judges={judges.data} models={models.data.items} />
      )}
      <Command command={judges.data?.[0]?.command ?? LIST_COMMAND} />
    </div>
  );
}

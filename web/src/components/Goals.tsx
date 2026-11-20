import type { ReactNode } from "react";
import { useParams } from "react-router";

import { useImporter } from "../importing";
import { useGoal, useGoals } from "../queries";
import { Command } from "./Command";
import list from "./ComponentList.module.css";
import pages from "./DetailPage.module.css";
import { DocumentView } from "./DocumentView";
import styles from "./Goals.module.css";
import { DropZone, ImportButton, ImportOutcomes } from "./Importing";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";

/** The command that imports a goal from a terminal. */
export const GOAL_IMPORT_COMMAND = "azathoth goal import <FILE>";

/**
 * `/goals`: every goal the instance keeps, in import order, and goal
 * documents imported by choosing them or dropping them anywhere on the
 * page, as the `import_goal` action (ADR 0015). A goal is never revised: one
 * already kept, unchanged, is said to be unchanged, and another goal with
 * its ID is refused.
 */
export function GoalList() {
  const goals = useGoals();
  const importer = useImporter("goals");
  const importFiles = (files: File[]) => {
    void importer.importFiles(files);
  };

  let body: ReactNode;

  if (goals.isPending) {
    body = (
      <p className={styles.quiet} role="status">
        Loading goals…
      </p>
    );
  } else if (goals.isError) {
    body = <Notice title="Couldn't load goals">{goals.error.message}</Notice>;
  } else if (goals.data.length === 0) {
    body = (
      <div className={list.empty}>
        <p className={list.emptyTitle}>No goals yet</p>
        <p className={list.emptyText}>
          Your local instance has no goals. Drop a goal document anywhere on this page, or choose
          one.
        </p>
        <ImportButton kind="goals" busy={importer.busy} onFiles={importFiles} quiet />
        <p className={list.emptyText}>Or import one from your terminal:</p>
        <Command command={GOAL_IMPORT_COMMAND} />
      </div>
    );
  } else {
    body = (
      <ul className={styles.list} aria-label="Goals">
        {goals.data.map((goal) => (
          <li key={goal.id} className={styles.goal}>
            <InstanceLink className={styles.name} to={`/goals/${encodeURIComponent(goal.id)}`}>
              {goal.name}
            </InstanceLink>
            <span className={styles.description}>{goal.description}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <DropZone kind="goals" onFiles={importFiles}>
      <div className={list.page}>
        <header className={list.header}>
          <div className={list.titles}>
            <h1 className={list.title}>Goals</h1>
            <p className={list.lead}>
              What a strategy is trying to accomplish: its success criteria and the constraints it
              keeps. A goal is never revised.
            </p>
          </div>
          {goals.data !== undefined && goals.data.length > 0 && (
            <ImportButton kind="goals" busy={importer.busy} onFiles={importFiles} />
          )}
        </header>
        <ImportOutcomes kind="goals" outcomes={importer.outcomes} onDismiss={importer.dismiss} />
        {body}
      </div>
    </DropZone>
  );
}

/** One list of a goal's, or that it has none. */
function Items({
  id,
  title,
  items,
  none,
}: {
  readonly id: string;
  readonly title: string;
  readonly items: readonly string[];
  readonly none: string;
}) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.heading}>
        {title}
      </h2>
      {items.length === 0 ? (
        <p className={styles.quiet}>{none}</p>
      ) : (
        <ul className={styles.items}>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** `/goals/:id`: one goal, its success criteria, its constraints, its document and command. */
export function GoalPage() {
  const { id = "" } = useParams();
  const goal = useGoal(id);

  const crumbs = (
    <nav className={pages.crumbs} aria-label="Breadcrumb">
      <InstanceLink to="/goals">Goals</InstanceLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{goal.data?.name ?? id}</span>
    </nav>
  );

  if (goal.isPending) {
    return (
      <div className={pages.page}>
        {crumbs}
        <p className={pages.loading} role="status">
          Loading this goal…
        </p>
      </div>
    );
  }

  if (goal.isError) {
    return (
      <div className={pages.page}>
        {crumbs}
        <Notice
          title={
            goal.error.code === "not_found" || goal.error.code === "invalid_argument"
              ? "No goal at this address"
              : "Couldn't load this goal"
          }
        >
          <p>{goal.error.message}</p>
          <p>
            <InstanceLink className={pages.back} to="/goals">
              Back to goals
            </InstanceLink>
          </p>
        </Notice>
      </div>
    );
  }

  const shown = goal.data;

  return (
    <div className={pages.page}>
      {crumbs}
      <header className={pages.titles}>
        <h1 className={pages.title}>{shown.name}</h1>
        <p className={pages.lead}>{shown.description}</p>
      </header>
      <Command command={shown.command} />
      <Items
        id="goal-criteria"
        title="Success criteria"
        items={shown.success_criteria}
        none="It names no success criteria."
      />
      <Items
        id="goal-constraints"
        title="Constraints"
        items={shown.constraints}
        none="It keeps no constraints."
      />
      <DocumentView document={shown.document} label={shown.name} />
    </div>
  );
}

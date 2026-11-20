import { useMemo, useState } from "react";

import type { SpendQuery } from "../api/client";
import { useAllowed } from "../permissions";
import { useSpend } from "../queries";
import {
  DEFAULT_SPEND_VIEW,
  browserTimeZone,
  spendQueryOf,
  spendViewSearch,
  type SpendView,
} from "../spending";
import { InstanceLink } from "./InstanceLink";
import { NotFound } from "./NotFound";
import { Notice } from "./Notice";
import styles from "./Spend.module.css";
import { Groups, OverTime, Totals } from "./SpendPage";

/** Returns the last 30 days' query of a view, in the browser's time zone, and the view. */
function useLastThirtyDays(
  changes: Partial<SpendView>,
): readonly [SpendQuery | null, SpendView, string] {
  const zone = useMemo(() => browserTimeZone(), []);
  const [now] = useState(() => new Date());
  const view: SpendView = { ...DEFAULT_SPEND_VIEW, timeZone: zone, ...changes };

  return [spendQueryOf(view, now), view, zone];
}

/** The link to the Spend page, its choices those of the summary it is beside. */
function OpenInSpend({ view, zone }: { readonly view: SpendView; readonly zone: string }) {
  const search = spendViewSearch(view, zone);

  return (
    <InstanceLink className={styles.link} to={search === "" ? "/spend" : `/spend?${search}`}>
      Open in Spend
    </InstanceLink>
  );
}

const NO_QUERY: SpendQuery = {
  since: "",
  until: "",
  period: "day",
  group: "model",
  timeZone: "UTC",
  workflowId: null,
};

/** One workflow's last 30 days, by model, once it is known spend may be read here. */
function WorkflowSpendShown({ workflowId }: { readonly workflowId: string }) {
  const [query, view, zone] = useLastThirtyDays({ group: "model", workflowId });
  const spend = useSpend(query ?? NO_QUERY, { enabled: query !== null });

  return (
    <section className={styles.section} aria-label="Spend">
      <h2 className={styles.heading}>Last 30 days</h2>
      <p className={styles.quiet}>
        What this workflow spent on each model, each call counted once, billed and estimated apart.
      </p>
      <p className={styles.quiet}>Read in {view.timeZone}.</p>
      {spend.isPending && (
        <p className={styles.quiet} role="status">
          Adding up what it spent…
        </p>
      )}
      {spend.isError && (
        <Notice title="Couldn't read what it spent">
          <p>{spend.error.message}</p>
        </Notice>
      )}
      {spend.data !== undefined && (
        <>
          <Totals totals={spend.data.totals} />
          <OverTime report={spend.data} />
          <Groups report={spend.data} />
        </>
      )}
      <p>
        <OpenInSpend view={view} zone={zone} />
      </p>
    </section>
  );
}

/**
 * `/workflows/:id/spend`: what one workflow spent in the last 30 days, by
 * model, in the browser's time zone (ADR 0014). Where spend may not be
 * read, it is the editor's page for an address it does not have.
 */
export function WorkflowSpend({ workflowId }: { readonly workflowId: string }) {
  const allowance = useAllowed("read_spend");

  return allowance.allowed ? <WorkflowSpendShown workflowId={workflowId} /> : <NotFound />;
}

/** One model's last 30 days, once it is known spend may be read here. */
function ModelSpendShown({ identifier }: { readonly identifier: string }) {
  const [query, view, zone] = useLastThirtyDays({ group: "model" });
  const spend = useSpend(query ?? NO_QUERY, { enabled: query !== null });
  const spent = spend.data?.groups.find((group) => group.key === identifier);

  return (
    <section className={styles.section} aria-label="Spend">
      <h2 className={styles.heading}>Spend, the last 30 days</h2>
      <p className={styles.quiet}>
        What every workflow spent on this model, billed and estimated apart.
      </p>
      <p className={styles.quiet}>Read in {view.timeZone}.</p>
      {spend.isPending && (
        <p className={styles.quiet} role="status">
          Adding up what was spent on it…
        </p>
      )}
      {spend.isError && (
        <p className={styles.quiet}>Couldn&apos;t read what was spent: {spend.error.message}</p>
      )}
      {spend.data !== undefined &&
        (spent === undefined ? (
          <p className={styles.quiet}>Nothing was spent on it in the last 30 days.</p>
        ) : (
          <Totals totals={spent} />
        ))}
      <p>
        <OpenInSpend view={view} zone={zone} />
      </p>
    </section>
  );
}

/**
 * A model page's Spend section: what was spent on it in the last 30 days,
 * linking to the Spend page by model (ADR 0014). Where spend may not be
 * read, it is not there, and nothing is asked.
 */
export function ModelSpend({ identifier }: { readonly identifier: string }) {
  const allowance = useAllowed("read_spend");

  return allowance.allowed ? <ModelSpendShown identifier={identifier} /> : null;
}

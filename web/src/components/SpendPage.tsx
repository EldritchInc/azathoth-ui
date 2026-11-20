import { useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { spendCsvPath, type SpendQuery } from "../api/client";
import {
  SPEND_GROUPS,
  SPEND_PERIODS,
  type SpendGroup,
  type SpendGroupTotals,
  type SpendPeriod,
  type SpendReport,
  type SpendTotals,
} from "../api/types";
import { modelPath } from "../models";
import { useAllowed } from "../permissions";
import { useList, useSpend } from "../queries";
import { useScope } from "../scope";
import {
  SPEND_PRESETS,
  browserTimeZone,
  callsOf,
  isTimeZone,
  periodName,
  spendDollars,
  spendQueryOf,
  spendViewOf,
  spendViewSearch,
  type SpendPreset,
  type SpendView,
} from "../spending";
import { Command } from "./Command";
import { InstanceLink } from "./InstanceLink";
import { NotFound } from "./NotFound";
import { Notice } from "./Notice";
import styles from "./Spend.module.css";
import structure from "./Structure.module.css";

/** What each period length is called on the page. */
const PERIOD_NAMES: Readonly<Record<SpendPeriod, string>> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

/** What each grouping is called, and what one of its groups is headed. */
const GROUP_NAMES: Readonly<Record<SpendGroup, readonly [string, string]>> = {
  workflow: ["Workflow", "By workflow"],
  model: ["Model", "By model"],
  provider: ["Provider", "By provider"],
  source: ["Source", "By source"],
};

const UNKNOWN_GROUP = "unknown";

/** Returns the day before an ISO 8601 time's date, as `YYYY-MM-DD`. */
function dayBefore(time: string): string {
  const [year, month, day] = time.slice(0, 10).split("-").map(Number);
  const before = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) - 1));

  return before.toISOString().slice(0, 10);
}

/** One group's name, linked to its workflow or its model where it has a page. */
function GroupName({ group, by }: { readonly group: SpendGroupTotals; readonly by: SpendGroup }) {
  if (by === "workflow") {
    return (
      <InstanceLink className={styles.link} to={`/workflows/${encodeURIComponent(group.key)}`}>
        {group.label}
      </InstanceLink>
    );
  }
  if (by === "model" && group.key !== UNKNOWN_GROUP) {
    return (
      <InstanceLink className={styles.link} to={modelPath(group.key)}>
        {group.label}
      </InstanceLink>
    );
  }

  return <>{group.label}</>;
}

/** The report's totals, billed and estimated apart, and how many calls had no price. */
export function Totals({ totals }: { readonly totals: SpendTotals }) {
  return (
    <>
      <ul className={styles.totals} aria-label="Totals">
        <li className={styles.tile} data-kind="billed">
          <span className={styles.tileLabel}>Billed</span>
          <strong className={styles.tileValue}>{spendDollars(totals.billed_usd)}</strong>
        </li>
        <li className={styles.tile} data-kind="estimated">
          <span className={styles.tileLabel}>Estimated</span>
          <strong className={styles.tileValue}>{spendDollars(totals.estimated_usd)}</strong>
        </li>
        <li className={styles.tile}>
          <span className={styles.tileLabel}>Calls</span>
          <strong className={styles.tileValue}>{totals.calls}</strong>
        </li>
        <li className={styles.tile} data-kind={totals.unpriced_calls > 0 ? "unpriced" : undefined}>
          <span className={styles.tileLabel}>Unpriced calls</span>
          <strong className={styles.tileValue}>{totals.unpriced_calls}</strong>
        </li>
      </ul>
      {totals.unpriced_calls > 0 && (
        <Notice title="Some calls have no price" tone="note">
          <p>
            {totals.unpriced_calls === 1
              ? "1 call has no known cost: it is counted here, never taken as free."
              : `${String(totals.unpriced_calls)} calls have no known cost: they are counted here, never taken as free.`}
          </p>
        </Notice>
      )}
    </>
  );
}

/** Returns what a period or group spent, said in words, billed and estimated apart. */
function spentLine(totals: SpendTotals): string {
  return `${spendDollars(totals.billed_usd)} billed, ${spendDollars(totals.estimated_usd)} estimated, ${callsOf(totals)}`;
}

/**
 * Each period as a bar, billed and estimated each its own colour and its
 * own length, and in words beside it.
 */
export function OverTime({ report }: { readonly report: SpendReport }) {
  const largest = Math.max(
    ...report.periods.map((period) => period.totals.billed_usd + period.totals.estimated_usd),
    0,
  );
  const share = (amount: number): string =>
    largest === 0 ? "0%" : `${String((amount / largest) * 100)}%`;

  return (
    <section className={styles.section} aria-label="Over time">
      <h2 className={styles.heading}>Over time</h2>
      <p className={styles.legend} aria-hidden="true">
        <span className={styles.swatch} data-kind="billed" /> Billed
        <span className={styles.swatch} data-kind="estimated" /> Estimated
      </p>
      <ol className={styles.periods}>
        {report.periods.map((period) => {
          const name = periodName(period, report.period);
          const nothing = period.totals.calls === 0;

          return (
            <li key={period.start} className={styles.period}>
              <span className={styles.periodLine}>
                {nothing ? `${name}: nothing spent` : `${name}: ${spentLine(period.totals)}`}
              </span>
              <span className={styles.bar} aria-hidden="true">
                <span
                  className={styles.segment}
                  data-kind="billed"
                  style={{ width: share(period.totals.billed_usd) }}
                />
                <span
                  className={styles.segment}
                  data-kind="estimated"
                  style={{ width: share(period.totals.estimated_usd) }}
                />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Each group's spend over the whole range. */
export function Groups({ report }: { readonly report: SpendReport }) {
  const [column, heading] = GROUP_NAMES[report.group];

  return (
    <section className={styles.section} aria-label={heading}>
      <h2 className={styles.heading}>{heading}</h2>
      {report.groups.length === 0 ? (
        <p className={styles.quiet}>Nothing was spent in this range.</p>
      ) : (
        <table className={structure.table}>
          <thead>
            <tr>
              <th scope="col">{column}</th>
              <th scope="col">Billed</th>
              <th scope="col">Estimated</th>
              <th scope="col">Calls</th>
            </tr>
          </thead>
          <tbody>
            {report.groups.map((group) => (
              <tr key={group.key}>
                <td>
                  <GroupName group={group} by={report.group} />
                </td>
                <td>{spendDollars(group.billed_usd)}</td>
                <td>{spendDollars(group.estimated_usd)}</td>
                <td>{callsOf(group)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Each period's groups, a period nothing was spent in said to be so. */
function EachPeriod({ report }: { readonly report: SpendReport }) {
  const [column] = GROUP_NAMES[report.group];

  return (
    <section className={styles.section} aria-label="Each period">
      <h2 className={styles.heading}>Each period</h2>
      <table className={structure.table}>
        <thead>
          <tr>
            <th scope="col">{PERIOD_NAMES[report.period]}</th>
            <th scope="col">{column}</th>
            <th scope="col">Billed</th>
            <th scope="col">Estimated</th>
            <th scope="col">Calls</th>
          </tr>
        </thead>
        <tbody>
          {report.periods.flatMap((period) => {
            const name = periodName(period, report.period);

            if (period.groups.length === 0) {
              return [
                <tr key={period.start}>
                  <td>{name}</td>
                  <td colSpan={4} className={styles.quiet}>
                    Nothing spent
                  </td>
                </tr>,
              ];
            }

            return period.groups.map((group) => (
              <tr key={`${period.start}-${group.key}`}>
                <td>{name}</td>
                <td>
                  <GroupName group={group} by={report.group} />
                </td>
                <td>{spendDollars(group.billed_usd)}</td>
                <td>{spendDollars(group.estimated_usd)}</td>
                <td>{callsOf(group)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </section>
  );
}

/** What a report can be asked: its range, periods, grouping, time zone and workflow. */
function Controls({
  view,
  query,
  onChange,
}: {
  readonly view: SpendView;
  readonly query: SpendQuery | null;
  readonly onChange: (view: SpendView) => void;
}) {
  const ids = {
    range: useId(),
    from: useId(),
    to: useId(),
    period: useId(),
    group: useId(),
    zone: useId(),
    zoneHint: useId(),
    workflow: useId(),
  };
  const workflows = useList("workflows");
  const [zone, setZone] = useState(view.timeZone);
  const zoneKnown = isTimeZone(zone);

  return (
    <form
      className={styles.controls}
      aria-label="Report"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div className={styles.field}>
        <label htmlFor={ids.range}>Range</label>
        <select
          id={ids.range}
          className={styles.select}
          value={view.preset}
          onChange={(event) => {
            const preset = event.target.value as SpendPreset;

            onChange(
              preset === "custom" && query !== null
                ? {
                    ...view,
                    preset,
                    from: view.from ?? query.since.slice(0, 10),
                    to: view.to ?? dayBefore(query.until),
                  }
                : { ...view, preset },
            );
          }}
        >
          {SPEND_PRESETS.map(([preset, name]) => (
            <option key={preset} value={preset}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {view.preset === "custom" && (
        <>
          <div className={styles.field}>
            <label htmlFor={ids.from}>From</label>
            <input
              id={ids.from}
              className={styles.input}
              type="date"
              value={view.from ?? ""}
              onChange={(event) => {
                onChange({ ...view, from: event.target.value || null });
              }}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={ids.to}>To</label>
            <input
              id={ids.to}
              className={styles.input}
              type="date"
              value={view.to ?? ""}
              onChange={(event) => {
                onChange({ ...view, to: event.target.value || null });
              }}
            />
          </div>
        </>
      )}
      <div className={styles.field}>
        <label htmlFor={ids.period}>Periods</label>
        <select
          id={ids.period}
          className={styles.select}
          value={view.period}
          onChange={(event) => {
            onChange({ ...view, period: event.target.value as SpendPeriod });
          }}
        >
          {SPEND_PERIODS.map((period) => (
            <option key={period} value={period}>
              {PERIOD_NAMES[period]}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor={ids.group}>Grouped by</label>
        <select
          id={ids.group}
          className={styles.select}
          value={view.group}
          onChange={(event) => {
            onChange({ ...view, group: event.target.value as SpendGroup });
          }}
        >
          {SPEND_GROUPS.map((group) => (
            <option key={group} value={group}>
              {GROUP_NAMES[group][0]}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor={ids.zone}>Time zone</label>
        <input
          id={ids.zone}
          className={styles.input}
          value={zone}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!zoneKnown}
          aria-describedby={ids.zoneHint}
          onChange={(event) => {
            const next = event.target.value;

            setZone(next);

            if (isTimeZone(next)) {
              onChange({ ...view, timeZone: next });
            }
          }}
        />
        <span id={ids.zoneHint} className={styles.hint} data-invalid={!zoneKnown}>
          {zoneKnown
            ? "An IANA time zone, such as America/New_York."
            : "Not a time zone this browser knows."}
        </span>
      </div>
      <div className={styles.field}>
        <label htmlFor={ids.workflow}>Workflow</label>
        <select
          id={ids.workflow}
          className={styles.select}
          value={view.workflowId ?? ""}
          onChange={(event) => {
            onChange({ ...view, workflowId: event.target.value || null });
          }}
        >
          <option value="">Every workflow</option>
          {(workflows.data ?? []).map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}

/** The Spend page, once it is known spend may be read here. */
function Spend() {
  const scope = useScope();
  const [search, setSearch] = useSearchParams();
  const browserZone = useMemo(() => browserTimeZone(), []);
  const [now] = useState(() => new Date());
  const view = spendViewOf(search, browserZone);
  const query = spendQueryOf(view, now);
  const spend = useSpend(
    query ?? {
      since: "",
      until: "",
      period: view.period,
      group: view.group,
      timeZone: view.timeZone,
      workflowId: view.workflowId,
    },
    { enabled: query !== null },
  );
  const report = query === null ? undefined : spend.data;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Spend</h1>
        <p className={styles.lead}>
          What this instance spent on models, each call counted once. Billed dollars are what a
          provider charged; estimated ones Azathoth priced. They are never added together.
        </p>
        <p className={styles.quiet}>Read in {view.timeZone}.</p>
      </header>
      <Controls
        view={view}
        query={query}
        onChange={(next) => {
          setSearch(spendViewSearch(next, browserZone), { replace: true });
        }}
      />
      {query === null && (
        <Notice title="That isn't a range" tone="note">
          <p>Choose two dates, the first no later than the second.</p>
        </Notice>
      )}
      {query !== null && spend.isPending && (
        <p className={styles.quiet} role="status">
          Adding up what was spent…
        </p>
      )}
      {query !== null && spend.isError && (
        <Notice title="Couldn't read what was spent">
          <p>{spend.error.message}</p>
        </Notice>
      )}
      {report !== undefined && query !== null && (
        <>
          <Totals totals={report.totals} />
          <OverTime report={report} />
          <Groups report={report} />
          <EachPeriod report={report} />
          <div className={styles.actions}>
            <a className={styles.link} href={spendCsvPath(query, scope.api)} download>
              Download CSV
            </a>
          </div>
          <Command command={report.command} />
        </>
      )}
    </div>
  );
}

/**
 * `/spend`: what an instance spent, and when, in the browser's time zone
 * unless another is named (ADR 0014). Its choices are kept in its address.
 * Where spend may not be read it is not here at all: the editor has no page
 * at this address for that person.
 */
export function SpendPage() {
  const allowance = useAllowed("read_spend");

  return allowance.allowed ? <Spend /> : <NotFound />;
}

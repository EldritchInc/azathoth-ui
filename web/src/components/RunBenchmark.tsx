import { useId, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { isBenchmarkSummary } from "../api/types";
import { targetOf } from "../benchmarking";
import { useDetail, useList, useStartBenchmarkRun, useStartComparison } from "../queries";
import { usePage } from "../scope";
import { ActionButton } from "./ActionButton";
import styles from "./Benchmarks.module.css";
import buttons from "./Buttons.module.css";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import layout from "./RunWorkflow.module.css";

/** A target a comparison scores against, as a person writes it. */
function TargetField({
  label,
  hint,
  value,
  onChange,
}: {
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const ids = { input: useId(), hint: useId() };
  const { problem } = targetOf(value);
  const shown = value.trim() !== "" && problem !== null;

  return (
    <div className={styles.field}>
      <label htmlFor={ids.input}>{label}</label>
      <input
        id={ids.input}
        className={styles.input}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={shown}
        aria-describedby={ids.hint}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <span id={ids.hint} className={styles.hint} data-invalid={shown}>
        {shown ? problem : hint}
      </span>
    </div>
  );
}

/**
 * `/benchmarks/:id/run` and `/benchmarks/:id/compare`: run one workflow
 * against a benchmark, or compare several, scored against latency and cost
 * targets: the `run_benchmark` action (ADR 0012). It runs as a live run,
 * case by case, on its own page; leaving that page never stops it.
 */
export function RunBenchmark({ comparing = false }: { readonly comparing?: boolean }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const page = usePage();
  const benchmark = useDetail("benchmarks", { id }, null);
  const workflows = useList("workflows");
  const run = useStartBenchmarkRun();
  const compare = useStartComparison();
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [latency, setLatency] = useState("");
  const [cost, setCost] = useState("");
  const selectId = useId();
  const listed = workflows.data ?? [];
  const runWith = workflowId ?? listed[0]?.id ?? null;
  const name = benchmark.data?.name ?? id;
  const base = `/benchmarks/${encodeURIComponent(id)}`;
  const empty =
    benchmark.data !== undefined &&
    isBenchmarkSummary(benchmark.data) &&
    benchmark.data.case_count === 0;
  const latencyTarget = targetOf(latency).value;
  const costTarget = targetOf(cost).value;
  const starting = run.isPending || compare.isPending;
  const failed = run.error ?? compare.error;
  const ready =
    !empty &&
    !starting &&
    (comparing
      ? chosen.size >= 2 && latencyTarget !== null && costTarget !== null
      : runWith !== null);
  const opened = {
    onSuccess: (started: { readonly handle: string }) => {
      void navigate(page(`/live/${started.handle}`));
    },
  };

  return (
    <div className={layout.page}>
      <nav className={layout.crumbs} aria-label="Breadcrumb">
        <InstanceLink to="/benchmarks">Benchmarks</InstanceLink>
        <span aria-hidden="true">/</span>
        <InstanceLink to={base}>{name}</InstanceLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{comparing ? "Compare" : "Run"}</span>
      </nav>
      <header className={layout.header}>
        <h1 className={layout.title}>
          {comparing ? `Compare workflows on ${name}` : `Run ${name}`}
        </h1>
        <p className={layout.lead}>
          {comparing
            ? "Each workflow runs every case, and is scored on quality, reliability, latency and cost. The best comes first."
            : "The workflow runs every case, at its latest revision, and each is judged as it finishes."}{" "}
          You can watch each case, leave and come back, and the execution is kept.
        </p>
      </header>
      {benchmark.isError && (
        <Notice title="Couldn't load this benchmark">
          <p>{benchmark.error.message}</p>
        </Notice>
      )}
      {empty && (
        <Notice title="It has no cases yet" tone="note">
          <p>
            A benchmark can’t run until it has a case.{" "}
            <InstanceLink className={styles.link} to={`${base}/cases/new`}>
              Add a case
            </InstanceLink>
          </p>
        </Notice>
      )}
      {workflows.isSuccess && listed.length === 0 && (
        <Notice title="There's no workflow to run" tone="note">
          <p>Import or create a workflow first.</p>
        </Notice>
      )}
      <form
        className={layout.form}
        aria-label={comparing ? "Compare workflows" : "Run the benchmark"}
        onSubmit={(event) => {
          event.preventDefault();

          if (!ready) {
            return;
          }
          if (comparing && latencyTarget !== null && costTarget !== null) {
            compare.mutate(
              {
                benchmarkId: id,
                workflowIds: listed.map((each) => each.id).filter((each) => chosen.has(each)),
                targetLatencySeconds: latencyTarget,
                targetCostUsd: costTarget,
              },
              opened,
            );
          } else if (!comparing && runWith !== null) {
            run.mutate({ benchmarkId: id, workflowId: runWith }, opened);
          }
        }}
      >
        {comparing ? (
          <>
            <fieldset className={styles.panel}>
              <legend className={styles.question}>Workflows to compare</legend>
              {listed.map((each) => (
                <label key={each.id} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={chosen.has(each.id)}
                    onChange={(event) => {
                      const next = new Set(chosen);

                      if (event.target.checked) {
                        next.add(each.id);
                      } else {
                        next.delete(each.id);
                      }
                      setChosen(next);
                    }}
                  />
                  {each.name}
                </label>
              ))}
              <p className={styles.hint}>Choose two or more.</p>
            </fieldset>
            <TargetField
              label="Target latency, in seconds"
              hint="A run this fast or faster scores full marks for latency."
              value={latency}
              onChange={setLatency}
            />
            <TargetField
              label="Target cost, in US dollars"
              hint="A run this cheap or cheaper scores full marks for cost."
              value={cost}
              onChange={setCost}
            />
          </>
        ) : (
          <div className={styles.field}>
            <label htmlFor={selectId}>Workflow</label>
            <select
              id={selectId}
              className={styles.select}
              value={runWith ?? ""}
              onChange={(event) => {
                setWorkflowId(event.target.value);
              }}
            >
              {listed.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {failed !== null && (
          <Notice title="It didn't start">
            <p>{failed.message}</p>
          </Notice>
        )}
        <div className={layout.actions}>
          <ActionButton
            action="run_benchmark"
            subject={id}
            type="submit"
            className={buttons.primary}
            disabled={!ready}
            aria-busy={starting}
          >
            {starting ? "Starting…" : comparing ? "Compare" : "Run"}
          </ActionButton>
          <InstanceLink className={buttons.quiet} to={base}>
            Cancel
          </InstanceLink>
        </div>
      </form>
    </div>
  );
}

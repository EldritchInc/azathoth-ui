import { useId, useState } from "react";
import { useNavigate, useParams } from "react-router";

import type { OptimizationStart } from "../api/client";
import { targetOf } from "../benchmarking";
import { generationCountOf } from "../optimizing";
import { useDetail, useList, useStartOptimization } from "../queries";
import { usePage } from "../scope";
import { ActionButton } from "./ActionButton";
import styles from "./Benchmarks.module.css";
import buttons from "./Buttons.module.css";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import { TargetField } from "./RunBenchmark";
import layout from "./RunWorkflow.module.css";

/**
 * `/workflows/:id/optimize`: optimize a workflow against a benchmark, scored
 * against latency and cost targets, for as many generations as asked: the
 * `optimize` action (ADR 0013). It runs as a live run, generation by
 * generation, on its own page; leaving that page never stops it.
 */
export function OptimizeWorkflow() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const page = usePage();
  const workflow = useDetail("workflows", { id }, null);
  const benchmarks = useList("benchmarks");
  const optimize = useStartOptimization();
  const [benchmarkId, setBenchmarkId] = useState<string | null>(null);
  const [latency, setLatency] = useState("");
  const [cost, setCost] = useState("");
  const [generations, setGenerations] = useState("1");
  const ids = { benchmark: useId(), generations: useId(), hint: useId() };
  const listed = benchmarks.data ?? [];
  const chosen = listed.find((each) => each.id === benchmarkId) ?? listed[0] ?? null;
  const empty = chosen !== null && chosen.case_count === 0 ? chosen : null;
  const name = workflow.data?.name ?? id;
  const base = `/workflows/${encodeURIComponent(id)}`;
  const latencyTarget = targetOf(latency).value;
  const costTarget = targetOf(cost).value;
  const count = generationCountOf(generations);
  const countShown = generations.trim() !== "" && count.problem !== null;
  const start: OptimizationStart | null =
    chosen !== null &&
    empty === null &&
    latencyTarget !== null &&
    costTarget !== null &&
    count.value !== null
      ? {
          workflowId: id,
          benchmarkId: chosen.id,
          targetLatencySeconds: latencyTarget,
          targetCostUsd: costTarget,
          generations: count.value,
        }
      : null;
  const ready = start !== null && !optimize.isPending;

  return (
    <div className={layout.page}>
      <nav className={layout.crumbs} aria-label="Breadcrumb">
        <InstanceLink to="/workflows">Workflows</InstanceLink>
        <span aria-hidden="true">/</span>
        <InstanceLink to={base}>{name}</InstanceLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Optimize</span>
      </nav>
      <header className={layout.header}>
        <h1 className={layout.title}>Optimize {name}</h1>
        <p className={layout.lead}>
          Each generation runs its candidates against every case of the benchmark, keeps what it
          measured as an experiment, and proposes new candidates from the best. The last proposals
          get a final evaluation. You can watch each generation, leave and come back, and the
          experiments are kept.
        </p>
      </header>
      {workflow.isError && (
        <Notice title="Couldn't load this workflow">
          <p>{workflow.error.message}</p>
        </Notice>
      )}
      {benchmarks.isSuccess && listed.length === 0 && (
        <Notice title="There's no benchmark to optimize against" tone="note">
          <p>
            Import or create a benchmark first.{" "}
            <InstanceLink className={styles.link} to="/benchmarks/new">
              New benchmark
            </InstanceLink>
          </p>
        </Notice>
      )}
      {empty !== null && (
        <Notice title="That benchmark has no cases yet" tone="note">
          <p>
            A workflow can’t be optimized against a benchmark until it has a case.{" "}
            <InstanceLink
              className={styles.link}
              to={`/benchmarks/${encodeURIComponent(empty.id)}/cases/new`}
            >
              Add a case
            </InstanceLink>
          </p>
        </Notice>
      )}
      <form
        className={layout.form}
        aria-label="Optimize the workflow"
        onSubmit={(event) => {
          event.preventDefault();

          if (start === null || optimize.isPending) {
            return;
          }
          optimize.mutate(start, {
            onSuccess: (started) => {
              void navigate(page(`/live/${started.handle}`));
            },
          });
        }}
      >
        <div className={styles.field}>
          <label htmlFor={ids.benchmark}>Benchmark</label>
          <select
            id={ids.benchmark}
            className={styles.select}
            value={chosen?.id ?? ""}
            onChange={(event) => {
              setBenchmarkId(event.target.value);
            }}
          >
            {listed.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        </div>
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
        <div className={styles.field}>
          <label htmlFor={ids.generations}>Generations</label>
          <input
            id={ids.generations}
            className={styles.input}
            inputMode="numeric"
            autoComplete="off"
            value={generations}
            aria-invalid={countShown}
            aria-describedby={ids.hint}
            onChange={(event) => {
              setGenerations(event.target.value);
            }}
          />
          <span id={ids.hint} className={styles.hint} data-invalid={countShown}>
            {countShown
              ? count.problem
              : "How many times it proposes new candidates before the final evaluation."}
          </span>
        </div>
        {optimize.error !== null && (
          <Notice title="It didn't start">
            <p>{optimize.error.message}</p>
          </Notice>
        )}
        <div className={layout.actions}>
          <ActionButton
            action="optimize"
            subject={id}
            type="submit"
            className={buttons.primary}
            disabled={!ready}
            aria-busy={optimize.isPending}
          >
            {optimize.isPending ? "Starting…" : "Optimize"}
          </ActionButton>
          <InstanceLink className={buttons.quiet} to={base}>
            Cancel
          </InstanceLink>
        </div>
      </form>
    </div>
  );
}

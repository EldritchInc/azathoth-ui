import { useId, useState } from "react";

import type { CaseComparison, RunDetail } from "../api/types";
import { expectedOf } from "../benchmarking";
import { useAddBenchmarkCase, useList, useRunFeedback } from "../queries";
import { resource } from "../permissions";
import { ActionButton } from "./ActionButton";
import styles from "./Benchmarks.module.css";
import buttons from "./Buttons.module.css";
import { ComparisonField, DescriptionField, JsonField } from "./CaseFields";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import judgment from "./RunJudgment.module.css";
import { SensitivityLabel } from "./SensitivityLabel";

/** What the case expects: the run's latest correction, or a value given. */
type Expecting = "correction" | "value";

/** The form that adds the run to one of the instance's benchmarks. */
function AddRun({
  run,
  benchmarks,
  corrected,
}: {
  readonly run: RunDetail;
  readonly benchmarks: readonly { readonly id: string; readonly name: string }[];
  /** Whether the run has a correction a case can expect. */
  readonly corrected: boolean;
}) {
  const [benchmarkId, setBenchmarkId] = useState(benchmarks[0]?.id ?? "");
  const [comparison, setComparison] = useState<CaseComparison>("exact");
  const [expecting, setExpecting] = useState<Expecting>("correction");
  const [expected, setExpected] = useState("");
  const [description, setDescription] = useState("");
  const add = useAddBenchmarkCase(benchmarkId);
  const ids = { benchmark: useId(), expecting: useId() };
  const giving = !corrected || expecting === "value";
  const read = expectedOf(expected);
  const ready = benchmarkId !== "" && (!giving || read.problem === null);
  const added = add.data;
  const addedTo = benchmarks.find((each) => each.id === added?.benchmark.id)?.name;

  return (
    <>
      <form
        className={styles.panel}
        aria-label="Add this run to a benchmark"
        onSubmit={(event) => {
          event.preventDefault();

          if (!ready || add.isPending) {
            return;
          }
          const words = description.trim();

          add.mutate({
            from: { kind: "run", runId: run.run_id },
            comparison,
            ...(giving ? { expected: read.value } : {}),
            ...(words === "" ? {} : { description: words }),
          });
        }}
      >
        <div className={styles.field}>
          <label htmlFor={ids.benchmark}>Benchmark</label>
          <select
            id={ids.benchmark}
            className={styles.select}
            value={benchmarkId}
            onChange={(event) => {
              setBenchmarkId(event.target.value);
              add.reset();
            }}
          >
            {benchmarks.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        </div>
        <ComparisonField value={comparison} onChange={setComparison} />
        {corrected ? (
          <fieldset className={judgment.dispositions}>
            <legend className={judgment.legend}>It expects</legend>
            <label className={judgment.choice}>
              <input
                type="radio"
                name={ids.expecting}
                checked={expecting === "correction"}
                onChange={() => {
                  setExpecting("correction");
                }}
              />
              Its latest correction
            </label>
            <label className={judgment.choice}>
              <input
                type="radio"
                name={ids.expecting}
                checked={expecting === "value"}
                onChange={() => {
                  setExpecting("value");
                }}
              />
              A value I give
            </label>
          </fieldset>
        ) : (
          <p className={styles.quiet}>
            It has no correction to expect, so give the value it should.
          </p>
        )}
        {giving && (
          <JsonField
            label="Expected"
            value={expected}
            onChange={setExpected}
            problem={read.problem}
            hint="Reads as JSON."
            placeholder='"What the run should have produced, as JSON"'
          />
        )}
        <DescriptionField
          value={description}
          onChange={setDescription}
          hint="Optional. What the case expects, in words."
        />
        <p className={styles.quiet}>
          The case keeps the run’s label: <SensitivityLabel sensitivity={run.sensitivity} />.
        </p>
        <div className={styles.actions}>
          <ActionButton
            action="edit_benchmark"
            subject={resource("benchmark", benchmarkId)}
            type="submit"
            className={buttons.primary}
            disabled={!ready || add.isPending}
            aria-busy={add.isPending}
          >
            {add.isPending ? "Adding…" : "Add to benchmark"}
          </ActionButton>
        </div>
      </form>
      {add.isError && <Notice title="The run wasn't added">{add.error.message}</Notice>}
      {added !== undefined && (
        <p className={styles.quiet} role="status">
          Added to {addedTo ?? added.benchmark.name}, in its revision{" "}
          {added.benchmark.revision.number}.{" "}
          <InstanceLink
            className={styles.link}
            to={`/benchmarks/${encodeURIComponent(added.benchmark.id)}/cases/${encodeURIComponent(added.case.case_id)}`}
          >
            Open the case
          </InstanceLink>
        </p>
      )}
    </>
  );
}

/**
 * A run made a case of one of the instance's benchmarks (ADR 0012): with a
 * comparison, expecting the run's latest correction when it has one, or a
 * value given. The case keeps the run's label. It is the `edit_benchmark`
 * action.
 */
export function RunToCase({ run }: { readonly run: RunDetail }) {
  const benchmarks = useList("benchmarks");
  const judgments = useRunFeedback(run.run_id);
  const heading = useId();
  const corrected =
    judgments.data?.some((each) => each.disposition === "bad" && each.corrected_output !== null) ??
    false;
  let body;

  if (benchmarks.isPending || judgments.isPending) {
    body = (
      <p className={styles.quiet} role="status">
        Loading the benchmarks…
      </p>
    );
  } else if (benchmarks.isError) {
    body = <p className={styles.quiet}>Couldn’t list the benchmarks: {benchmarks.error.message}</p>;
  } else if (benchmarks.data.length === 0) {
    body = (
      <p className={styles.quiet}>
        There’s no benchmark here yet.{" "}
        <InstanceLink className={styles.link} to="/benchmarks/new">
          Create a benchmark
        </InstanceLink>
      </p>
    );
  } else {
    body = <AddRun run={run} benchmarks={benchmarks.data} corrected={corrected} />;
  }

  return (
    <section className={judgment.section} aria-labelledby={heading}>
      <header className={judgment.header}>
        <h2 id={heading} className={judgment.title}>
          Add to a benchmark
        </h2>
      </header>
      <p className={styles.quiet}>
        The run’s input becomes a case’s input, so the benchmark checks every workflow against it.
      </p>
      {body}
    </section>
  );
}

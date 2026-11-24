import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import type { CaseFrom } from "../api/client";
import type { CaseComparison, Sensitivity } from "../api/types";
import { expectedOf } from "../benchmarking";
import { useAddBenchmarkCase, useDetail } from "../queries";
import { givenOf, NEW_DRAFT, type InputDraft } from "../runInput";
import { usePage } from "../scope";
import { resource } from "../permissions";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import { ComparisonField, DescriptionField, JsonField } from "./CaseFields";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import { RunInput, type InputLabels } from "./RunInput";
import layout from "./RunWorkflow.module.css";
import { SensitivityPicker } from "./SensitivityPicker";

const CASE_LABELS: InputLabels = {
  modes: "Give the case",
  noneName: "Nothing",
  none: "",
  text: "The case's input, as text",
  json: "The case's input, as JSON",
  file: "Choose the case's file",
  placeholder: "What the workflow is given when the case runs",
};

/** Returns what a case is made from, as a person gave it, or `null` while it can't be. */
function fromOf(draft: InputDraft): CaseFrom | null {
  const { given } = givenOf(draft);

  switch (given?.kind) {
    case "json":
      return { kind: "json", value: given.value };
    case "file":
      return { kind: "file", file: given.file };
    default:
      return null;
  }
}

/**
 * `/benchmarks/:id/cases/new`: a case added to a benchmark's next revision,
 * from text, JSON or a file, how it is compared, and what it expects: the
 * `edit_benchmark` action (ADR 0012). Its page opens once it is added.
 */
export function AddCase() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const page = usePage();
  const benchmark = useDetail("benchmarks", { id }, null);
  const add = useAddBenchmarkCase(id);
  const [draft, setDraft] = useState<InputDraft>(NEW_DRAFT);
  const [comparison, setComparison] = useState<CaseComparison>("exact");
  const [expected, setExpected] = useState("");
  const [description, setDescription] = useState("");
  const [sensitivity, setSensitivity] = useState<Sensitivity | null>(null);
  const from = fromOf(draft);
  const read = expectedOf(expected);
  const name = benchmark.data?.name ?? id;
  const base = `/benchmarks/${encodeURIComponent(id)}`;
  const ready = from !== null && read.problem === null;

  return (
    <div className={layout.page}>
      <nav className={layout.crumbs} aria-label="Breadcrumb">
        <InstanceLink to="/benchmarks">Benchmarks</InstanceLink>
        <span aria-hidden="true">/</span>
        <InstanceLink to={base}>{name}</InstanceLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Add case</span>
      </nav>
      <header className={layout.header}>
        <h1 className={layout.title}>Add a case to {name}</h1>
        <p className={layout.lead}>
          The case is added to the benchmark’s next revision. Every earlier revision, and every
          execution that ran it, stays as it was.
        </p>
      </header>
      <form
        className={layout.form}
        aria-label="Add case"
        onSubmit={(event) => {
          event.preventDefault();

          if (from === null || read.problem !== null || add.isPending) {
            return;
          }
          const words = description.trim();

          add.mutate(
            {
              from,
              comparison,
              expected: read.value,
              ...(words === "" ? {} : { description: words }),
              sensitivity,
            },
            {
              onSuccess: (change) => {
                void navigate(page(`${base}/cases/${encodeURIComponent(change.case.case_id)}`));
              },
            },
          );
        }}
      >
        <RunInput
          draft={draft}
          onChange={setDraft}
          label="Input"
          labels={CASE_LABELS}
          modes={["text", "json", "file"]}
        />
        <ComparisonField value={comparison} onChange={setComparison} />
        <JsonField
          label="Expected"
          value={expected}
          onChange={setExpected}
          problem={read.problem}
          hint="Reads as JSON."
          placeholder='"What its run should produce, as JSON"'
        />
        <DescriptionField
          value={description}
          onChange={setDescription}
          hint="Optional. What the case expects, in words."
        />
        <SensitivityPicker value={sensitivity} onChange={setSensitivity} />
        {add.isError && <Notice title="The case wasn't added">{add.error.message}</Notice>}
        <div className={layout.actions}>
          <ActionButton
            action="edit_benchmark"
            subject={resource("benchmark", id)}
            type="submit"
            className={buttons.primary}
            disabled={!ready || add.isPending}
            aria-busy={add.isPending}
          >
            {add.isPending ? "Adding…" : "Add case"}
          </ActionButton>
          <InstanceLink className={buttons.quiet} to={base}>
            Cancel
          </InstanceLink>
        </div>
      </form>
    </div>
  );
}

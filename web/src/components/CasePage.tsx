import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import type { BenchmarkCaseDetail } from "../api/types";
import {
  caseEditOf,
  citationsOf,
  draftOf,
  expectedOf,
  SOURCE_NAMES,
  type EditDraft,
} from "../benchmarking";
import { parseRevision } from "../kinds";
import {
  useBenchmarkCase,
  useDetail,
  useEditBenchmarkCase,
  useRemoveBenchmarkCase,
} from "../queries";
import { instanceLabel, usePage, useScope } from "../scope";
import { ActionButton } from "./ActionButton";
import styles from "./Benchmarks.module.css";
import buttons from "./Buttons.module.css";
import { ComparisonField, DescriptionField, JsonField, LabelRaise } from "./CaseFields";
import { Command } from "./Command";
import { InstanceLink } from "./InstanceLink";
import { JsonBlock } from "./JsonBlock";
import { Notice } from "./Notice";
import { Restricted, RestrictedScope } from "./Restricted";
import layout from "./RunWorkflow.module.css";
import { SensitivityLabel } from "./SensitivityLabel";

const MISSING_CODES = new Set(["not_found", "revision_not_found", "invalid_argument"]);

/** The form that edits a case: only what changes is sent, and a label is only raised. */
function EditCase({
  benchmarkId,
  detail,
  onDone,
}: {
  readonly benchmarkId: string;
  readonly detail: BenchmarkCaseDetail;
  readonly onDone: () => void;
}) {
  const edit = useEditBenchmarkCase(benchmarkId);
  const [draft, setDraft] = useState<EditDraft>(() => draftOf(detail));
  const { edit: sent, problem } = caseEditOf(detail, draft);
  const unchanged = sent !== null && Object.keys(sent).length === 0;

  return (
    <form
      className={styles.panel}
      aria-label="Edit case"
      onSubmit={(event) => {
        event.preventDefault();

        if (sent === null || unchanged || edit.isPending) {
          return;
        }
        edit.mutate({ caseId: detail.case_id, edit: sent }, { onSuccess: onDone });
      }}
    >
      <ComparisonField
        value={draft.comparison}
        onChange={(comparison) => {
          setDraft({ ...draft, comparison });
        }}
      />
      <JsonField
        label="Expected"
        value={draft.expected}
        onChange={(expected) => {
          setDraft({ ...draft, expected });
        }}
        problem={expectedOf(draft.expected).problem}
        hint="Reads as JSON."
      />
      <DescriptionField
        value={draft.description}
        onChange={(description) => {
          setDraft({ ...draft, description });
        }}
        hint="What the case expects, in words."
      />
      <JsonField
        label="Citations"
        value={draft.citations}
        onChange={(citations) => {
          setDraft({ ...draft, citations });
        }}
        problem={citationsOf(draft.citations).problem}
        hint="What its run must cite. Leave it empty to require none."
        placeholder='{"require": [{"source": "…", "segment": "…"}], "on_unverified": "fail"}'
      />
      <LabelRaise
        current={detail.sensitivity}
        value={draft.sensitivity}
        onChange={(sensitivity) => {
          setDraft({ ...draft, sensitivity });
        }}
      />
      {problem !== null && <p className={styles.hint}>{problem}</p>}
      {edit.isError && <Notice title="The case wasn't changed">{edit.error.message}</Notice>}
      <div className={styles.actions}>
        <ActionButton
          action="edit_benchmark"
          subject={benchmarkId}
          type="submit"
          className={buttons.primary}
          disabled={sent === null || unchanged || edit.isPending}
          aria-busy={edit.isPending}
        >
          {edit.isPending ? "Saving…" : "Save changes"}
        </ActionButton>
        <button type="button" className={buttons.quiet} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** What a case expects of its run's citations, when it names any. */
function Citations({ detail }: { readonly detail: BenchmarkCaseDetail }) {
  if (detail.citations === null) {
    return <p className={styles.quiet}>Its run need not cite anything.</p>;
  }

  return (
    <>
      <ul className={styles.citations} aria-label="Required citations">
        {detail.citations.require.map((cited) => (
          <li key={`${cited.source}\u0000${cited.segment}`}>
            <code>{cited.source}</code> · <code>{cited.segment}</code>
          </li>
        ))}
      </ul>
      <p className={styles.quiet}>
        {detail.citations.on_unverified === "fail"
          ? "A citation that doesn’t verify fails the case."
          : "A citation that doesn’t verify is ignored."}
      </p>
    </>
  );
}

/**
 * `/benchmarks/:id/cases/:caseId`: one case at the revision the address
 * names, the latest by default: its input, what it expects, and what its
 * run must cite, a restricted case's hidden until shown (ADR 0011). At the
 * latest revision, Edit changes it and Remove takes it out of the next
 * revision, asking first and naming the instance (ADR 0012).
 */
export function CasePage() {
  const { id = "", caseId = "" } = useParams();
  const [search] = useSearchParams();
  const revision = parseRevision(search.get("revision"));
  const navigate = useNavigate();
  const page = usePage();
  const scope = useScope();
  const benchmark = useDetail("benchmarks", { id }, null);
  const detail = useBenchmarkCase(id, caseId, revision);
  const remove = useRemoveBenchmarkCase(id);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const name = benchmark.data?.name ?? id;
  const base = `/benchmarks/${encodeURIComponent(id)}`;

  const crumbs = (
    <nav className={layout.crumbs} aria-label="Breadcrumb">
      <InstanceLink to="/benchmarks">Benchmarks</InstanceLink>
      <span aria-hidden="true">/</span>
      <InstanceLink to={base}>{name}</InstanceLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">Case</span>
    </nav>
  );

  if (detail.isPending) {
    return (
      <div className={layout.page}>
        {crumbs}
        <p className={styles.quiet} role="status">
          Loading this case…
        </p>
      </div>
    );
  }

  if (detail.isError) {
    return (
      <div className={layout.page}>
        {crumbs}
        <Notice
          title={
            MISSING_CODES.has(detail.error.code)
              ? "No case at this address"
              : "Couldn't load this case"
          }
        >
          <p>{detail.error.message}</p>
        </Notice>
      </div>
    );
  }

  const shown = detail.data;
  const latest = revision === null;

  return (
    <RestrictedScope>
      <div className={layout.page}>
        {crumbs}
        <header className={layout.header}>
          <h1 className={layout.title}>
            {shown.description === "" ? `Case ${shown.case_id}` : shown.description}
          </h1>
          <dl className={styles.facts}>
            <div>
              <dt>Compared</dt>
              <dd>{shown.comparison}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>
                {shown.source_run_id === null ? (
                  SOURCE_NAMES[shown.source]
                ) : (
                  <InstanceLink
                    className={styles.link}
                    to={`/runs/${encodeURIComponent(shown.source_run_id)}`}
                  >
                    {SOURCE_NAMES[shown.source]}
                  </InstanceLink>
                )}
              </dd>
            </div>
            <div>
              <dt>Label</dt>
              <dd>
                <SensitivityLabel sensitivity={shown.sensitivity} />
              </dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{shown.revision}</dd>
            </div>
          </dl>
          {latest && (
            <div className={styles.actions}>
              <ActionButton
                action="edit_benchmark"
                subject={id}
                type="button"
                className={buttons.quiet}
                aria-expanded={editing}
                onClick={() => {
                  setEditing((open) => !open);
                  setConfirming(false);
                }}
              >
                Edit
              </ActionButton>
              <ActionButton
                action="edit_benchmark"
                subject={id}
                type="button"
                className={buttons.danger}
                disabled={remove.isPending}
                onClick={() => {
                  setConfirming(true);
                  setEditing(false);
                }}
              >
                Remove
              </ActionButton>
            </div>
          )}
        </header>
        {!latest && (
          <Notice title={`This is the case at revision ${String(shown.revision)}`} tone="note">
            <p>
              Only the latest revision’s cases can be changed.{" "}
              <InstanceLink
                className={styles.link}
                to={`${base}/cases/${encodeURIComponent(shown.case_id)}`}
              >
                Show it at the latest
              </InstanceLink>
            </p>
          </Notice>
        )}
        {confirming && (
          <div className={styles.confirm} role="group" aria-label="Remove case">
            <p className={styles.question}>
              Remove this case from {name} on {instanceLabel(scope.name)}?
            </p>
            <p className={styles.quiet}>
              The next revision leaves it out. Earlier revisions keep it, and so does every
              execution that ran it.
            </p>
            <div className={styles.actions}>
              <ActionButton
                action="edit_benchmark"
                subject={id}
                type="button"
                className={buttons.danger}
                onClick={() => {
                  remove.mutate(shown.case_id, {
                    onSuccess: () => {
                      void navigate(page(base));
                    },
                  });
                  setConfirming(false);
                }}
              >
                Remove it
              </ActionButton>
              <button
                type="button"
                className={buttons.quiet}
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Keep it
              </button>
            </div>
          </div>
        )}
        {remove.isError && <Notice title="The case wasn't removed">{remove.error.message}</Notice>}
        <Command command={shown.command} />
        {editing && (
          <Restricted sensitivity={shown.sensitivity} what="the case" subject={shown.case_id}>
            <EditCase
              benchmarkId={id}
              detail={shown}
              onDone={() => {
                setEditing(false);
              }}
            />
          </Restricted>
        )}
        <section className={styles.section} aria-label="Input">
          <h2 className={styles.heading}>Input</h2>
          <Restricted
            sensitivity={shown.sensitivity}
            what="the case's input"
            subject={shown.case_id}
          >
            <JsonBlock value={shown.input} label="The case's input, as JSON" />
          </Restricted>
        </section>
        <section className={styles.section} aria-label="Expected">
          <h2 className={styles.heading}>Expected</h2>
          <Restricted
            sensitivity={shown.sensitivity}
            what="what the case expects"
            subject={shown.case_id}
          >
            <JsonBlock value={shown.expected} label="What the case expects, as JSON" />
          </Restricted>
        </section>
        <section className={styles.section} aria-label="Citations">
          <h2 className={styles.heading}>Citations</h2>
          <Citations detail={shown} />
        </section>
      </div>
    </RestrictedScope>
  );
}

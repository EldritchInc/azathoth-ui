import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { givenOf, NEW_DRAFT, type InputDraft } from "../runInput";
import { useDetail, useStartRun } from "../queries";
import buttons from "./Buttons.module.css";
import { Notice } from "./Notice";
import { RunInput } from "./RunInput";
import styles from "./RunWorkflow.module.css";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor" stroke="none">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

/**
 * `/workflows/:id/run`: give a workflow its input and run it. The run is a
 * live run of the editor's server (ADR 0007), shown on its own page as it
 * runs; leaving that page never stops it.
 */
export function RunWorkflow() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const detail = useDetail("workflows", { id }, null);
  const start = useStartRun();
  const [draft, setDraft] = useState<InputDraft>(NEW_DRAFT);
  const { given } = givenOf(draft);
  const name = detail.data?.name ?? id;

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link to="/workflows">Workflows</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/workflows/${id}`}>{name}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Run</span>
      </nav>
      <header className={styles.header}>
        <h1 className={styles.title}>Run {name}</h1>
        <p className={styles.lead}>
          It runs on your local instance, at its latest revision. You can watch each step as it
          goes, leave and come back, and the finished run is kept.
        </p>
      </header>
      {detail.isError && (
        <Notice title="Couldn't load this workflow">
          <p>{detail.error.message}</p>
        </Notice>
      )}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();

          if (given !== null && !start.isPending) {
            start.mutate(
              { workflowId: id, given },
              {
                onSuccess: (run) => {
                  void navigate(`/live/${run.handle}`);
                },
              },
            );
          }
        }}
      >
        <RunInput draft={draft} onChange={setDraft} />
        {start.isError && (
          <Notice title="The run didn't start">
            <p>{start.error.message}</p>
          </Notice>
        )}
        <div className={styles.actions}>
          <button
            type="submit"
            className={buttons.primary}
            disabled={given === null || start.isPending || detail.isError}
          >
            <PlayIcon />
            {start.isPending ? "Starting…" : "Run"}
          </button>
          <Link className={buttons.quiet} to={`/workflows/${id}`}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

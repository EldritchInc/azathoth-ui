import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { importDocument } from "../api/client";
import type { ComponentDetail } from "../api/types";
import {
  allDrafts,
  discardDraft,
  readDraft,
  same,
  saveDraft,
  workflowId,
  workflowName,
  type Draft,
} from "../drafts";
import {
  asObject,
  asText,
  bumped,
  newWorkflow,
  setMetadata,
  stepsOf,
  type JsonObject,
  type VersionPart,
} from "../editing";
import { begin, record, redo, undo, type History } from "../history";
import { problems, titleOf, type Problem } from "../problems";
import { useDetail } from "../queries";
import { browserStorage } from "../theme";
import buttons from "./Buttons.module.css";
import { problemsByStep, type Composing } from "./composing";
import { Notice } from "./Notice";
import styles from "./WorkflowEditor.module.css";
import { WorkflowSteps } from "./WorkflowSteps";

const MISSING_CODES = new Set(["not_found", "revision_not_found", "invalid_argument"]);

const PARTS: readonly VersionPart[] = ["patch", "minor", "major"];

/** What became of the last save: a revision made, or Azathoth's refusal. */
type Outcome =
  | { readonly kind: "saved"; readonly number: number }
  | { readonly kind: "refused"; readonly message: string };

function documentFrom(state: unknown): JsonObject | null {
  if (typeof state !== "object" || state === null || !("document" in state)) {
    return null;
  }

  const document: unknown = state.document;

  return typeof document === "object" && document !== null && !Array.isArray(document)
    ? (document as JsonObject)
    : null;
}

function Icon({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function Problems({
  found,
  document,
}: {
  readonly found: readonly Problem[];
  readonly document: JsonObject;
}) {
  const [, setSearch] = useSearchParams();
  const steps = new Map(stepsOf(document).map((step) => [asText(step.id) ?? "", step]));

  if (found.length === 0) {
    return (
      <section className={styles.problems} data-clear="true" aria-labelledby="problems-heading">
        <h2 id="problems-heading" className={styles.panelTitle}>
          Ready to save
        </h2>
        <p className={styles.panelText}>The editor finds nothing Azathoth would refuse.</p>
      </section>
    );
  }

  return (
    <section className={styles.problems} aria-labelledby="problems-heading">
      <h2 id="problems-heading" className={styles.panelTitle}>
        {found.length === 1 ? "1 thing to fix" : `${String(found.length)} things to fix`}
      </h2>
      <p className={styles.panelText}>Azathoth refuses a workflow until these are fixed.</p>
      <ul className={styles.problemList}>
        {found.map((problem, index) => {
          const step = problem.step === null ? undefined : steps.get(problem.step);

          return (
            <li key={`${problem.step ?? "workflow"}-${String(index)}`}>
              {step !== undefined && problem.step !== null && (
                <button
                  type="button"
                  className={styles.problemStep}
                  onClick={() => {
                    const id = problem.step ?? "";

                    setSearch(
                      (current) => {
                        const next = new URLSearchParams(current);

                        next.set("step", id);
                        return next;
                      },
                      { replace: true },
                    );
                  }}
                >
                  {titleOf(step)}
                </button>
              )}
              <span>{problem.message}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The editor of one workflow: its name, description and version, its steps,
 * and what Azathoth would refuse, with undo and redo. Edits are kept in this
 * browser until they are saved, which imports the document into the local
 * instance as the workflow's next revision, or discarded.
 */
function Editor({
  id,
  start,
  latest,
}: {
  readonly id: string;
  readonly start: Draft;
  readonly latest: ComponentDetail | null;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const fieldId = useId();
  const [history, setHistory] = useState<History<JsonObject>>(() => begin(start.document));
  const [saved, setSaved] = useState<{ document: JsonObject | null; number: number | null }>(
    () => ({
      document:
        latest === null
          ? null
          : start.base === latest.revision.number
            ? (latest.document as JsonObject)
            : null,
      number: start.base,
    }),
  );
  const [kept, setKept] = useState(true);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const present = history.present;
  const dirty = saved.document === null || !same(present, saved.document);
  const found = useMemo(() => problems(present), [present]);
  const composing = useMemo<Composing>(
    () => ({
      problems: problemsByStep(found),
      change: (edit) => {
        setHistory((current) => record(current, edit(current.present)));
        setOutcome(null);
      },
      newId: () => crypto.randomUUID(),
      document: present,
    }),
    [found, present],
  );
  const metadata = asObject(present.metadata);
  const name = asText(metadata.name) ?? "";
  const version = asText(metadata.version) ?? "";
  const behind =
    start.base !== null &&
    latest !== null &&
    saved.number === start.base &&
    latest.latest_number > start.base
      ? latest.latest_number
      : null;

  useEffect(() => {
    if (dirty) {
      setKept(saveDraft(browserStorage(), id, { document: present, base: saved.number }));
    } else {
      discardDraft(browserStorage(), id);
      setKept(true);
    }
  }, [dirty, id, present, saved.number]);

  useEffect(() => {
    if (!dirty || kept) {
      return undefined;
    }

    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty, kept]);

  const change = (next: JsonObject, group: string | null = null): void => {
    setHistory((current) => record(current, next, group));
    setOutcome(null);
  };

  const save = async (): Promise<void> => {
    if (saving) {
      return;
    }
    setSaving(true);
    setOutcome(null);

    const sent = present;

    try {
      const detail = await importDocument("workflows", JSON.stringify(sent));

      setSaved({ document: sent, number: detail.revision.number });
      setOutcome({ kind: "saved", number: detail.revision.number });
      await client.invalidateQueries({ queryKey: ["workflows"] });
    } catch (error) {
      setOutcome({
        kind: "refused",
        message: error instanceof Error ? error.message : "The save failed.",
      });
    } finally {
      setSaving(false);
    }
  };

  const undoChange = (): void => {
    setHistory(undo);
  };

  const redoChange = (): void => {
    setHistory(redo);
  };

  const keys = useRef({ save, undo: undoChange, redo: redoChange });

  keys.current = { save, undo: undoChange, redo: redoChange };

  useEffect(() => {
    const press = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        void keys.current.save();
      } else if ((key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey)) {
        event.preventDefault();
        keys.current.redo();
      } else if (key === "z") {
        event.preventDefault();
        keys.current.undo();
      }
    };

    window.addEventListener("keydown", press);
    return () => {
      window.removeEventListener("keydown", press);
    };
  }, []);

  const discard = (): void => {
    discardDraft(browserStorage(), id);
    void navigate(saved.number === null ? "/workflows" : `/workflows/${id}`);
  };

  const status = saving
    ? "Saving…"
    : dirty
      ? kept
        ? "Unsaved changes, kept in this browser"
        : "Unsaved changes: this browser can't keep them, so save before you leave"
      : saved.number === null
        ? "Not saved yet"
        : `Saved as revision ${String(saved.number)}`;

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link to="/workflows">Workflows</Link>
        <span aria-hidden="true">/</span>
        {saved.number === null ? (
          <span>{name === "" ? "New workflow" : name}</span>
        ) : (
          <Link to={`/workflows/${id}`}>{name === "" ? id : name}</Link>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page">Editing</span>
      </nav>

      <div className={styles.toolbar} role="toolbar" aria-label="Editing">
        <p className={styles.status} data-dirty={dirty ? "true" : undefined} aria-live="polite">
          <span className={styles.dot} aria-hidden="true" />
          {status}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={buttons.icon}
            aria-label="Undo"
            title="Undo (⌘Z)"
            disabled={history.past.length === 0}
            onClick={undoChange}
          >
            <Icon>
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </Icon>
          </button>
          <button
            type="button"
            className={buttons.icon}
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            disabled={history.future.length === 0}
            onClick={redoChange}
          >
            <Icon>
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </Icon>
          </button>
          {discarding ? (
            <span className={styles.confirm}>
              Discard your unsaved edits?
              <button type="button" className={buttons.danger} onClick={discard}>
                Discard
              </button>
              <button
                type="button"
                className={buttons.quiet}
                onClick={() => {
                  setDiscarding(false);
                }}
              >
                Keep editing
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={buttons.quiet}
              disabled={!dirty || saving}
              onClick={() => {
                setDiscarding(true);
              }}
            >
              Discard
            </button>
          )}
          <button
            type="button"
            className={buttons.primary}
            title="Save (⌘S)"
            disabled={saving || !dirty}
            onClick={() => {
              void save();
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {outcome?.kind === "saved" && (
        <Notice title={`Saved as revision ${String(outcome.number)}`} tone="note">
          <p>
            Your local instance holds it now.{" "}
            <Link
              className={styles.link}
              to={`/workflows/${id}?revision=${String(outcome.number)}`}
            >
              View it
            </Link>
          </p>
        </Notice>
      )}
      {outcome?.kind === "refused" && (
        <Notice title="Azathoth refused this workflow">
          <p>{outcome.message}</p>
          <p>Nothing was saved; your edits are still here.</p>
        </Notice>
      )}
      {behind !== null && (
        <Notice title={`These edits started from revision ${String(start.base)}`} tone="note">
          <p>
            The latest is revision {behind} now. Saving makes the next revision from these edits,
            leaving out whatever changed since.
          </p>
        </Notice>
      )}

      <section className={styles.identity} aria-label="The workflow">
        <label className="visually-hidden" htmlFor={`${fieldId}-name`}>
          Name
        </label>
        <input
          id={`${fieldId}-name`}
          className={styles.name}
          value={name}
          placeholder="Name this workflow"
          spellCheck={false}
          onChange={(event) => {
            change(setMetadata(present, { name: event.target.value }), "name");
          }}
        />
        <label className={styles.label} htmlFor={`${fieldId}-description`}>
          Description
        </label>
        <textarea
          id={`${fieldId}-description`}
          className={styles.description}
          value={asText(metadata.description) ?? ""}
          rows={2}
          placeholder="What does it do, and for whom?"
          onChange={(event) => {
            change(setMetadata(present, { description: event.target.value }), "description");
          }}
        />
        <div className={styles.version}>
          <label className={styles.label} htmlFor={`${fieldId}-version`}>
            Version
          </label>
          <input
            id={`${fieldId}-version`}
            className={styles.versionInput}
            value={version}
            spellCheck={false}
            onChange={(event) => {
              change(setMetadata(present, { version: event.target.value }), "version");
            }}
          />
          {PARTS.map((part) => {
            const next = bumped(version, part);

            return (
              next !== null && (
                <button
                  key={part}
                  type="button"
                  className={styles.bump}
                  title={`Make it ${next}`}
                  onClick={() => {
                    change(setMetadata(present, { version: next }));
                  }}
                >
                  + {part}
                </button>
              )
            );
          })}
        </div>
      </section>

      <div className={styles.body}>
        <div className={styles.main}>
          <WorkflowSteps document={present} composing={composing} />
        </div>
        <aside className={styles.aside}>
          <Problems found={found} document={present} />
        </aside>
      </div>
    </div>
  );
}

/**
 * `/workflows/:id/edit`: edits a workflow from its draft when one is kept,
 * from the document it was handed when it is new, or from its latest
 * revision.
 */
export function WorkflowEditor() {
  const { id = "" } = useParams();
  const location = useLocation();
  const offered = documentFrom(location.state as unknown);
  const [stored] = useState(() => readDraft(browserStorage(), id));
  const detail = useDetail("workflows", { id }, null);
  const latest = detail.data ?? null;

  if (stored === null && offered === null) {
    if (detail.isPending) {
      return (
        <p className={styles.loading} role="status">
          Loading this workflow…
        </p>
      );
    }
    if (detail.isError) {
      return (
        <div className={styles.page}>
          <Notice
            title={
              MISSING_CODES.has(detail.error.code)
                ? "No workflow at this address"
                : "Couldn't load this workflow"
            }
          >
            <p>{detail.error.message}</p>
            <p>
              <Link className={styles.link} to="/workflows">
                Back to workflows
              </Link>
            </p>
          </Notice>
        </div>
      );
    }
  }
  if (typeof stored?.base === "number" && detail.isPending) {
    return (
      <p className={styles.loading} role="status">
        Loading this workflow…
      </p>
    );
  }

  const start: Draft =
    stored ??
    (offered === null
      ? { document: (latest?.document ?? {}) as JsonObject, base: latest?.revision.number ?? null }
      : { document: offered, base: null });

  return <Editor key={id} id={id} start={start} latest={latest} />;
}

/**
 * `/workflows/new`: starts a new workflow, with ids of its own, and opens
 * it in the editor.
 */
export function NewWorkflow({
  makeId = () => crypto.randomUUID(),
}: {
  readonly makeId?: () => string;
}) {
  const [document] = useState(() =>
    newWorkflow({ workflow: makeId(), step: makeId(), specification: makeId() }),
  );

  return (
    <Navigate to={`/workflows/${workflowId(document) ?? ""}/edit`} replace state={{ document }} />
  );
}

/** The drafts kept in this browser, each a link back to its editor. */
export function DraftList({ known }: { readonly known: ReadonlySet<string> }) {
  const [drafts] = useState(() =>
    [...allDrafts(browserStorage())].sort(([, a], [, b]) =>
      (workflowName(a.document) ?? "").localeCompare(workflowName(b.document) ?? ""),
    ),
  );

  if (drafts.length === 0) {
    return null;
  }

  return (
    <section className={styles.drafts} aria-labelledby="drafts-heading">
      <h2 id="drafts-heading" className={styles.panelTitle}>
        Unsaved drafts
      </h2>
      <ul className={styles.draftList}>
        {drafts.map(([id, draft]) => (
          <li key={id}>
            <Link className={styles.draftLink} to={`/workflows/${id}/edit`}>
              {workflowName(draft.document) ?? "Untitled workflow"}
            </Link>
            <span className={styles.draftTag}>
              {draft.base === null || !known.has(id)
                ? "new"
                : `edits to revision ${String(draft.base)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useId, useState } from "react";

import type { Judgment } from "../api/client";
import type { FeedbackDisposition, RunDetail, RunFeedback } from "../api/types";
import { DISPOSITION_NAMES } from "../feedback";
import { parseObject } from "../forms";
import { useRecordFeedback, useRunFeedback } from "../queries";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import { JsonBlock } from "./JsonBlock";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";
import { Restricted } from "./Restricted";
import styles from "./RunJudgment.module.css";

/** What a person has written of a judgment so far. */
interface Draft {
  readonly disposition: FeedbackDisposition | null;
  readonly reason: string;
  readonly corrected: string;
}

const EMPTY: Draft = { disposition: null, reason: "", corrected: "" };

/** What a corrected output reads as: nothing, a JSON value, or why it is not JSON yet. */
type Corrected =
  | { readonly given: false }
  | { readonly given: true; readonly value: unknown }
  | { readonly given: true; readonly error: string };

function correctedOf(text: string): Corrected {
  if (text.trim() === "") {
    return { given: false };
  }
  try {
    return { given: true, value: JSON.parse(text) as unknown };
  } catch {
    const parsed = parseObject(text);

    return { given: true, error: parsed.error ?? "It can't be read." };
  }
}

/** Returns the judgment a draft sends: a corrected output only with a bad one. */
function judgmentOf(draft: Draft & { readonly disposition: FeedbackDisposition }): Judgment {
  const reason = draft.reason.trim();
  const corrected = draft.disposition === "bad" ? correctedOf(draft.corrected) : { given: false };

  return {
    disposition: draft.disposition,
    ...(reason === "" ? {} : { reason }),
    ...(corrected.given && "value" in corrected ? { correctedOutput: corrected.value } : {}),
  };
}

function JudgmentItem({ judgment }: { readonly judgment: RunFeedback }) {
  return (
    <li className={styles.item}>
      <p className={styles.line}>
        <span className={styles.disposition} data-feedback={judgment.disposition}>
          {DISPOSITION_NAMES[judgment.disposition]}
        </span>
        <span className={styles.when}>
          <RelativeTime iso={judgment.created_at} />
        </span>
      </p>
      {judgment.reason !== null && <p className={styles.reason}>{judgment.reason}</p>}
      {judgment.disposition === "bad" && judgment.corrected_output !== null && (
        <JsonBlock
          value={judgment.corrected_output}
          label="What it should have produced, as JSON"
        />
      )}
    </li>
  );
}

/** The form that judges a run: good or bad, why, and for a bad one, what it should have produced. */
function JudgeRun({ runId }: { readonly runId: string }) {
  const record = useRecordFeedback(runId);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const ids = { reason: useId(), corrected: useId(), hint: useId(), state: useId() };
  const corrected = draft.disposition === "bad" ? correctedOf(draft.corrected) : null;
  const unreadable = corrected !== null && "error" in corrected ? corrected.error : null;
  const disposition = draft.disposition;

  return (
    <>
      <form
        className={styles.form}
        aria-label="Judge this run"
        onSubmit={(event) => {
          event.preventDefault();

          if (disposition === null || unreadable !== null) {
            return;
          }
          record.mutate(judgmentOf({ ...draft, disposition }), {
            onSuccess: () => {
              setDraft(EMPTY);
            },
          });
        }}
      >
        <fieldset className={styles.dispositions}>
          <legend className={styles.legend}>How did it do?</legend>
          {(["good", "bad"] as const).map((each) => (
            <label key={each} className={styles.choice} data-feedback={each}>
              <input
                type="radio"
                name={`${runId}-disposition`}
                value={each}
                checked={draft.disposition === each}
                onChange={() => {
                  setDraft({ ...draft, disposition: each });
                }}
              />
              {DISPOSITION_NAMES[each]}
            </label>
          ))}
        </fieldset>
        <div className={styles.field}>
          <label htmlFor={ids.reason}>Reason</label>
          <textarea
            id={ids.reason}
            className={styles.text}
            rows={2}
            value={draft.reason}
            aria-describedby={ids.hint}
            onChange={(event) => {
              setDraft({ ...draft, reason: event.target.value });
            }}
          />
          <span id={ids.hint} className={styles.hint}>
            A bad judgment needs one.
          </span>
        </div>
        {draft.disposition === "bad" && (
          <div className={styles.field}>
            <label htmlFor={ids.corrected}>What it should have produced</label>
            <textarea
              id={ids.corrected}
              className={styles.code}
              rows={4}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              placeholder='"The result it should have given, as JSON"'
              value={draft.corrected}
              aria-invalid={unreadable !== null}
              aria-describedby={ids.state}
              onChange={(event) => {
                setDraft({ ...draft, corrected: event.target.value });
              }}
            />
            <span id={ids.state} className={styles.hint} data-invalid={unreadable !== null}>
              {unreadable === null
                ? "Optional. Any JSON value: text goes in quotes."
                : `It isn’t JSON yet: ${unreadable}`}
            </span>
          </div>
        )}
        <div className={styles.actions}>
          <ActionButton
            action="annotate_run"
            subject={runId}
            type="submit"
            className={buttons.primary}
            disabled={disposition === null || unreadable !== null || record.isPending}
            aria-busy={record.isPending}
          >
            Record judgment
          </ActionButton>
        </div>
      </form>
      {record.isError && (
        <Notice title="Couldn't record the judgment">{record.error.message}</Notice>
      )}
    </>
  );
}

/**
 * A run's judgments, newest first, and a way to judge it again: the
 * `annotate_run` action. A judgment is never changed; the newest is the
 * run's (ADR 0012). A restricted run's judgments are hidden with the rest
 * of its data, since a reason or a corrected output may repeat it.
 */
export function RunJudgment({ run }: { readonly run: RunDetail }) {
  const judgments = useRunFeedback(run.run_id);
  const heading = useId();

  return (
    <section className={styles.section} aria-labelledby={heading}>
      <h2 id={heading} className={styles.title}>
        Judgment
      </h2>
      {judgments.isPending && (
        <p className={styles.quiet} role="status">
          Loading its judgments…
        </p>
      )}
      {judgments.isError && (
        <p className={styles.quiet}>Couldn’t load its judgments: {judgments.error.message}</p>
      )}
      {judgments.data?.length === 0 && (
        <p className={styles.quiet}>Nobody has judged this run yet.</p>
      )}
      {judgments.data !== undefined && judgments.data.length > 0 && (
        <Restricted sensitivity={run.sensitivity} what="its judgments" subject={run.run_id}>
          <ol className={styles.list} aria-label="Judgments">
            {judgments.data.map((judgment) => (
              <JudgmentItem key={judgment.feedback_id} judgment={judgment} />
            ))}
          </ol>
        </Restricted>
      )}
      <JudgeRun runId={run.run_id} />
    </section>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router";

import { isStepTrial } from "../api/types";
import type { JsonObject } from "../editing";
import { useCancelRun, useTryStep } from "../queries";
import { keptStepRun, liveStepRun, progressOf, type InputMode } from "../running";
import {
  inputDraft,
  needsRunInput,
  NEW_TRIAL,
  trialInputs,
  trialStart,
  type TrialDraft,
  type TrialInput,
} from "../trying";
import { useLiveEvents } from "../useLiveEvents";
import buttons from "./Buttons.module.css";
import { Notice } from "./Notice";
import { RunInput, type InputLabels } from "./RunInput";
import { StepRunPanel } from "./StepRunPanel";
import styles from "./TryStep.module.css";

/** How an input that must be given may be: there is nothing written to leave it as. */
const GIVEN: readonly InputMode[] = ["text", "json", "file"];

/** How an input that may be left as written may be: as written first. */
const OPTIONAL: readonly InputMode[] = ["none", "text", "json", "file"];

function labelsOf(input: TrialInput): InputLabels {
  return {
    modes: `Give ${input.name}`,
    noneName: "As written",
    none: `It reads ${input.from}, as written.`,
    text: `${input.name}, as text`,
    json: `${input.name}, as JSON`,
    file: `Choose a file for ${input.name}`,
    placeholder: `What ${input.name} is given`,
  };
}

/** One try of the step, as it runs and once it has: what it did, or why it didn't. */
function Trial({
  handle,
  id,
  title,
}: {
  readonly handle: string;
  readonly id: string;
  readonly title: string;
}) {
  const stream = useLiveEvents(handle);
  const cancel = useCancelRun();
  const progress = useMemo(() => progressOf(stream.events), [stream.events]);
  const end = stream.end;
  const page = (
    <Link className={styles.page} to={`/live/${handle}`}>
      Open its page
    </Link>
  );

  if (end === null) {
    return (
      <div className={styles.trial}>
        <StepRunPanel
          run={liveStepRun(progress, id, stream.lost)}
          title={title}
          heading="Trying it"
          label={`Trying ${title}`}
        />
        {stream.lost ? (
          <Notice title="The try's events stopped coming">
            <p>The editor’s server may have stopped. Its page asks it again.</p>
          </Notice>
        ) : (
          <div className={styles.actions}>
            <button
              type="button"
              className={buttons.danger}
              disabled={cancel.isPending}
              onClick={() => {
                cancel.mutate(handle);
              }}
            >
              {cancel.isPending ? "Cancelling…" : "Cancel"}
            </button>
            {page}
          </div>
        )}
      </div>
    );
  }

  const trial = isStepTrial(end.result) ? end.result : null;

  return (
    <div className={styles.trial}>
      {end.state === "cancelled" && (
        <Notice title="The try was cancelled" tone="note">
          <p>It stopped where it was, and nothing of it was kept.</p>
        </Notice>
      )}
      {end.state === "refused" && (
        <Notice title="Azathoth refused to try it">
          <p>{end.error?.message ?? "It gave no reason."}</p>
        </Notice>
      )}
      {trial !== null && (
        <>
          <StepRunPanel
            run={keptStepRun(trial.step)}
            title={title}
            heading="As tried"
            label={`${title} as tried`}
          />
          {trial.warnings.length > 0 && (
            <ul className={styles.warnings} aria-label="Warnings">
              {trial.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className={styles.actions}>{page}</div>
    </div>
  );
}

/**
 * Trying one step of the workflow alone, as it stands, saved or not (ADR
 * 0007): each input given, or left to read as written where it may be, and
 * the run's input while an input reads it. The step runs here now, as a run
 * would run it, and nothing of it is kept; its try shows as it runs.
 */
export function TryStep({
  document,
  id,
  title,
  blocked,
}: {
  readonly document: JsonObject;
  readonly id: string;
  readonly title: string;
  /** Whether Azathoth would refuse the step as it stands. */
  readonly blocked: boolean;
}) {
  const inputs = useMemo(() => trialInputs(document, id), [document, id]);
  const [draft, setDraft] = useState<TrialDraft>(NEW_TRIAL);
  const [handle, setHandle] = useState<string | null>(null);
  const start = useTryStep();
  const ready = trialStart(document, id, inputs, draft);
  const hint = blocked
    ? "Fix what Azathoth would refuse in this step first."
    : ready.ok
      ? "It runs here now, as a run would run it, and nothing of it is kept."
      : ready.problem;

  return (
    <div className={styles.form}>
      {inputs.length === 0 && <p className={styles.quiet}>It takes no inputs.</p>}
      {inputs.map((input) => (
        <RunInput
          key={input.name}
          label={<code>{input.name}</code>}
          labels={labelsOf(input)}
          modes={input.optional ? OPTIONAL : GIVEN}
          rows={3}
          compact
          draft={inputDraft(draft, input)}
          onChange={(changed) => {
            setDraft((last) => ({ ...last, inputs: { ...last.inputs, [input.name]: changed } }));
          }}
        />
      ))}
      {needsRunInput(inputs, draft) && (
        <RunInput
          label="The run’s input"
          rows={3}
          compact
          draft={draft.run}
          onChange={(run) => {
            setDraft((last) => ({ ...last, run }));
          }}
        />
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={buttons.primary}
          disabled={blocked || !ready.ok || start.isPending}
          onClick={() => {
            if (ready.ok) {
              start.mutate(ready.start, {
                onSuccess: (run) => {
                  setHandle(run.handle);
                },
              });
            }
          }}
        >
          {start.isPending ? "Starting…" : "Try it"}
        </button>
        <p className={styles.hint} data-problem={!blocked && !ready.ok ? "true" : undefined}>
          {hint}
        </p>
      </div>
      {start.isError && (
        <Notice title="The try didn't start">
          <p>{start.error.message}</p>
        </Notice>
      )}
      {handle !== null && <Trial key={handle} handle={handle} id={id} title={title} />}
    </div>
  );
}

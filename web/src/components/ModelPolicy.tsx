import { useState } from "react";

import type { DataPolicy, PolicyAnswer, PortfolioEntry } from "../api/types";
import { useDeclarePolicy } from "../queries";
import { instanceLabel, useScope } from "../scope";
import { resource } from "../permissions";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import styles from "./ModelPolicy.module.css";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";

const ANSWERS: readonly { readonly value: PolicyAnswer; readonly name: string }[] = [
  { value: "yes", name: "Yes" },
  { value: "no", name: "No" },
  { value: "unknown", name: "Unknown" },
];

/** How one declared answer reads: yes, no, or that it was never declared. */
function answered(answer: PolicyAnswer): string {
  return answer === "unknown" ? "Not declared" : answer === "yes" ? "Yes" : "No";
}

/** Returns whether a policy lets its model receive restricted input (Azathoth's ADR 0123). */
function isPrivate(policy: DataPolicy): boolean {
  return policy.retains_data === "no" && policy.trains_on_data === "no";
}

/** One question of a policy being declared: yes, no or unknown. */
function Question({
  question,
  value,
  onChange,
}: {
  readonly question: string;
  readonly value: PolicyAnswer;
  readonly onChange: (value: PolicyAnswer) => void;
}) {
  return (
    <div className={styles.question}>
      <span className={styles.asked}>{question}</span>
      <div className={styles.answers} role="radiogroup" aria-label={question}>
        {ANSWERS.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            className={styles.answer}
            aria-checked={value === choice.value}
            onClick={() => {
              onChange(choice.value);
            }}
          >
            {choice.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A model's data policy (ADR 0011): what was declared its provider does
 * with data, whether it may then receive restricted input, who declared it
 * and when; and declaring it, the `declare_policy` action, confirmed and
 * naming the instance. A policy is declared for a model the portfolio
 * holds, and never verified.
 */
export function ModelPolicy({
  identifier,
  entry,
}: {
  readonly identifier: string;
  /** The model's portfolio entry, or none when the portfolio doesn't hold it. */
  readonly entry: PortfolioEntry | undefined;
}) {
  const scope = useScope();
  const declare = useDeclarePolicy();
  const [drafting, setDrafting] = useState<DataPolicy | null>(null);

  return (
    <section className={styles.section} aria-labelledby="model-policy">
      <div className={styles.head}>
        <h2 id="model-policy" className={styles.title}>
          Data policy
        </h2>
        {entry !== undefined && drafting === null && (
          <ActionButton
            action="declare_policy"
            subject={resource("model", identifier)}
            type="button"
            className={buttons.quiet}
            onClick={() => {
              declare.reset();
              setDrafting(entry.data_policy);
            }}
          >
            Declare policy…
          </ActionButton>
        )}
      </div>
      {entry === undefined ? (
        <p className={styles.quiet}>
          Add it to your local portfolio first, then declare its policy.
        </p>
      ) : (
        <>
          <dl className={styles.facts}>
            <div>
              <dt>Retains data</dt>
              <dd>{answered(entry.data_policy.retains_data)}</dd>
            </div>
            <div>
              <dt>Trains on data</dt>
              <dd>{answered(entry.data_policy.trains_on_data)}</dd>
            </div>
            <div>
              <dt>Declared</dt>
              <dd>
                {entry.policy_declared_by === null ? (
                  "Never declared"
                ) : (
                  <>
                    by <span className={styles.author}>{entry.policy_declared_by.name}</span>,{" "}
                    <RelativeTime iso={entry.policy_declared_at} />
                  </>
                )}
              </dd>
            </div>
          </dl>
          <p className={styles.verdict} data-private={entry.receives_restricted}>
            {entry.receives_restricted
              ? "It may receive restricted input."
              : "It may not receive restricted input."}
          </p>
          <p className={styles.quiet}>
            What was declared of its provider, never verified: neither Azathoth nor the editor can
            check a provider&apos;s terms.
          </p>
        </>
      )}
      {entry !== undefined && drafting !== null && (
        <div className={styles.confirm} role="group" aria-label="Declare policy">
          <p className={styles.ask}>
            Declare the policy of {identifier} on {instanceLabel(scope.name)}?
          </p>
          <Question
            question="Retains data"
            value={drafting.retains_data}
            onChange={(retains_data) => {
              setDrafting({ ...drafting, retains_data });
            }}
          />
          <Question
            question="Trains on data"
            value={drafting.trains_on_data}
            onChange={(trains_on_data) => {
              setDrafting({ ...drafting, trains_on_data });
            }}
          />
          <p className={styles.verdict} data-private={isPrivate(drafting)}>
            {isPrivate(drafting)
              ? "It may then receive every restricted run’s input."
              : "It may not receive restricted input then."}
          </p>
          <div className={styles.buttons}>
            <ActionButton
              action="declare_policy"
              subject={resource("model", identifier)}
              type="button"
              className={buttons.primary}
              disabled={declare.isPending}
              aria-busy={declare.isPending}
              onClick={() => {
                declare.mutate(
                  { identifier, policy: drafting },
                  {
                    onSuccess: () => {
                      setDrafting(null);
                    },
                  },
                );
              }}
            >
              {declare.isPending ? "Declaring…" : "Declare"}
            </ActionButton>
            <button
              type="button"
              className={buttons.quiet}
              disabled={declare.isPending}
              onClick={() => {
                setDrafting(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {declare.isError && (
        <Notice title="The policy wasn't declared">
          <p>{declare.error.message}</p>
        </Notice>
      )}
      {declare.isSuccess && drafting === null && (
        <Notice title="Policy declared." tone="note">
          <p>
            {declare.data.receives_restricted
              ? "It may receive restricted input from now on."
              : "It may not receive restricted input."}
          </p>
        </Notice>
      )}
    </section>
  );
}

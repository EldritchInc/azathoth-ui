import { useContext, useMemo, useState, type ReactNode } from "react";

import type { Sensitivity } from "../api/types";
import { RevealingContext, useRevealing } from "../revealing";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import styles from "./Restricted.module.css";

/**
 * One page's view of its restricted data (ADR 0011): once any of it is
 * shown, all of it is, until the page is left. Nothing is remembered, so
 * it is hidden again every time the page is opened.
 */
export function RestrictedScope({ children }: { readonly children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const value = useMemo(
    () => ({
      revealed,
      reveal: () => {
        setRevealed(true);
      },
    }),
    [revealed],
  );

  return <RevealingContext value={value}>{children}</RevealingContext>;
}

/**
 * What stands in for restricted data until it is shown: why it is hidden,
 * and a button that shows it, the `read_restricted` action, disabled with
 * the reason wherever that action is refused.
 */
export function RestrictedNotice({
  what,
  subject,
  inline = false,
}: {
  /** What is hidden, as a sentence names it: "the run's input". */
  readonly what: string;
  /** What the data belongs to, such as a run's id. */
  readonly subject: string;
  /** Whether it stands in a table's cell, where room is short. */
  readonly inline?: boolean;
}) {
  const { reveal } = useRevealing();
  const show = (
    <ActionButton
      action="read_restricted"
      subject={subject}
      type="button"
      className={buttons.quiet}
      onClick={reveal}
    >
      Show it
    </ActionButton>
  );

  if (inline) {
    return (
      <span className={styles.inline} role="group" aria-label={`Restricted: ${what}`}>
        Restricted {show}
      </span>
    );
  }

  return (
    <div className={styles.hidden} role="group" aria-label={`Restricted: ${what}`}>
      <p className={styles.title}>This is restricted data</p>
      <p className={styles.why}>
        {what.charAt(0).toUpperCase()}
        {what.slice(1)} was labelled restricted, so it stays hidden until you show it, and is hidden
        again each time this page is opened.
      </p>
      {show}
    </div>
  );
}

interface RestrictedProps {
  readonly sensitivity: Sensitivity;
  readonly what: string;
  readonly subject: string;
  readonly inline?: boolean;
  readonly children: ReactNode;
}

function Shown({ sensitivity, what, subject, inline = false, children }: RestrictedProps) {
  const { revealed } = useRevealing();

  if (sensitivity !== "restricted" || revealed) {
    return children;
  }

  return <RestrictedNotice what={what} subject={subject} inline={inline} />;
}

/**
 * Data shown as it is, or, when it is restricted, only once a person shows
 * it (ADR 0011). Within a `RestrictedScope`, showing any of a page's
 * restricted data shows all of it; outside one, it is a scope of its own.
 */
export function Restricted(props: RestrictedProps) {
  const scope = useContext(RevealingContext);

  return scope === null ? (
    <RestrictedScope>
      <Shown {...props} />
    </RestrictedScope>
  ) : (
    <Shown {...props} />
  );
}

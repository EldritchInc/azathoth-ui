import { useId, type ButtonHTMLAttributes } from "react";

import { useAllowed, type Action } from "../permissions";

/**
 * A button's own attributes, and the action it takes, on what, and on which
 * instance. What it acts on is its `subject`, since HTML's own attributes
 * already have a `resource`.
 */
export type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly action: Action;
  readonly subject?: string | null;
  readonly instance?: string;
};

/**
 * A button that changes something, naming the action it takes (ADR 0009).
 *
 * It asks whether the action may be taken, and when it may not, it
 * disables itself and gives the reason, as its title and its accessible
 * description, rather than letting the server refuse it.
 */
export function ActionButton({
  action,
  subject = null,
  instance,
  disabled,
  title,
  children,
  ...rest
}: ActionButtonProps) {
  const allowance = useAllowed(action, subject, instance);
  const reason = allowance.allowed ? null : allowance.reason;
  const reasonId = useId();

  return (
    <>
      <button
        {...rest}
        data-action={action}
        disabled={disabled === true || reason !== null}
        title={reason ?? title}
        aria-describedby={reason === null ? rest["aria-describedby"] : reasonId}
      >
        {children}
      </button>
      {reason !== null && (
        <span id={reasonId} className="visually-hidden">
          {reason}
        </span>
      )}
    </>
  );
}

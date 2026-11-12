import { useId, useState } from "react";
import { Link } from "react-router";

import type { ComponentStatus, Relation } from "../api/types";
import { DESCRIPTIONS, type ComponentRef, type Kind } from "../kinds";
import { usePull, usePush, useRemoteStatus, useRemotes } from "../queries";
import { RELATION_TEXT, firstRemote, selectionOf, shortDigest } from "../remotes";
import buttons from "./Buttons.module.css";
import { Notice } from "./Notice";
import styles from "./Ship.module.css";
import { PullReportView, PushReportView } from "./SyncReports";

/** The relations a push would change nothing for, so Ship offers none. */
const NOTHING_TO_PUSH: ReadonlySet<Relation> = new Set(["in_sync", "behind", "remote_only"]);

function Revision({
  number,
  digest,
}: {
  readonly number: number | null;
  readonly digest: string | null;
}) {
  if (number === null || digest === null) {
    return <span className={styles.none}>none</span>;
  }

  return (
    <span title={digest}>
      revision {number} <code className={styles.mono}>{shortDigest(digest)}</code>
    </span>
  );
}

/** Where this one component stands at the remote: its relation, each side, and production there. */
function Standing({
  component,
  reachable,
  kind,
}: {
  readonly component: ComponentStatus | undefined;
  readonly reachable: boolean;
  readonly kind: Kind;
}) {
  if (!reachable || component === undefined || component.relation === null) {
    return (
      <p className={styles.meaning}>
        The remote isn&apos;t answering, so where this stands there is unknown. A push will say
        whether it can reach it.
      </p>
    );
  }

  const text = RELATION_TEXT[component.relation];
  const production = component.remote_production_digest;

  return (
    <div className={styles.standing} data-relation={component.relation}>
      <p className={styles.relation}>{text.label}</p>
      <p className={styles.meaning}>{text.meaning}</p>
      <dl className={styles.sides}>
        <div>
          <dt>Here</dt>
          <dd>
            <Revision number={component.local_number} digest={component.local_digest} />
          </dd>
        </div>
        <div>
          <dt>There</dt>
          <dd>
            <Revision number={component.remote_number} digest={component.remote_digest} />
          </dd>
        </div>
        {kind === "workflows" && (
          <div>
            <dt>In production there</dt>
            <dd>
              {production === null ? (
                <span className={styles.none}>none</span>
              ) : (
                <code className={styles.mono} title={production}>
                  {shortDigest(production)}
                </code>
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * Ship: push this one component, with what it needs, to a named remote. It
 * says where the component stands there first, asks before pushing, since
 * a pushed revision stays at the remote, and then shows what the remote
 * received and each warning of what would stop it running there. A push
 * that has diverged offers a pull, which forks the component here.
 */
export function Ship({
  kind,
  component,
  label,
}: {
  readonly kind: Kind;
  readonly component: ComponentRef;
  readonly label: string;
}) {
  const remotes = useRemotes();
  const [chosen, setChosen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const push = usePush();
  const pull = usePull();
  const selectId = useId();
  const all = remotes.data ?? [];
  const remote = all.find((each) => each.name === chosen) ?? firstRemote(all);
  const selection = selectionOf(kind, component);
  const status = useRemoteStatus(remote?.name ?? "", selection, {
    enabled: remote?.token_set === true,
  });
  const singular = DESCRIPTIONS[kind].singular;

  if (remotes.isPending) {
    return (
      <p className={styles.meaning} role="status">
        Loading remotes…
      </p>
    );
  }

  if (remotes.isError) {
    return <Notice title="Couldn't list the remotes">{remotes.error.message}</Notice>;
  }

  if (remote === undefined) {
    return (
      <Notice title="No remote is named yet" tone="note">
        <p>
          <Link to="/remotes">Name your team&apos;s remote</Link> to ship this {singular} to it.
        </p>
      </Notice>
    );
  }

  const standing = status.data?.components[0];
  const relation = standing?.relation ?? null;
  const canPush =
    remote.token_set && status.isSuccess && (relation === null || !NOTHING_TO_PUSH.has(relation));
  const diverged =
    relation === "diverged" || (push.isError && push.error.code === "remote_diverged");

  const choose = (name: string): void => {
    setChosen(name);
    setConfirming(false);
    push.reset();
    pull.reset();
  };

  return (
    <section className={styles.ship} aria-label="Ship">
      <div className={styles.choose}>
        <label htmlFor={selectId}>Ship to</label>
        <select
          id={selectId}
          className={styles.select}
          value={remote.name}
          onChange={(event) => {
            choose(event.target.value);
          }}
        >
          {all.map((each) => (
            <option key={each.name} value={each.name}>
              {each.name}
            </option>
          ))}
        </select>
        <code className={styles.mono}>{remote.url}</code>
        <Link className={styles.all} to={`/remotes/${encodeURIComponent(remote.name)}`}>
          Everything at {remote.name}
        </Link>
      </div>
      {!remote.token_set ? (
        <Notice title={`${remote.token_variable} isn't set`} tone="note">
          <p>
            The editor reads {remote.name}&apos;s token from {remote.token_variable}. Set it in a
            terminal, then launch <code>azathoth-ui</code> from it again.
          </p>
        </Notice>
      ) : status.isPending ? (
        <p className={styles.meaning} role="status">
          Asking {remote.name}…
        </p>
      ) : status.isError ? (
        <Notice title={`Couldn't ask ${remote.name}`}>{status.error.message}</Notice>
      ) : (
        <Standing component={standing} reachable={status.data.reachable} kind={kind} />
      )}
      {confirming ? (
        <div className={styles.confirm} role="group" aria-label="Confirm the push">
          <p>
            Push the latest revision of {label} to {remote.name}, with what it needs? Each revision
            it receives stays there, and nothing runs there until {remote.name} promotes it.
          </p>
          <div className={styles.buttons}>
            <button
              type="button"
              className={buttons.primary}
              disabled={push.isPending}
              aria-busy={push.isPending}
              onClick={() => {
                push.mutate(
                  { name: remote.name, selection },
                  {
                    onSettled: () => {
                      setConfirming(false);
                    },
                  },
                );
              }}
            >
              {push.isPending ? "Pushing…" : `Push to ${remote.name}`}
            </button>
            <button
              type="button"
              className={buttons.quiet}
              disabled={push.isPending}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.buttons}>
          {canPush && !diverged && (
            <button
              type="button"
              className={buttons.primary}
              onClick={() => {
                push.reset();
                setConfirming(true);
              }}
            >
              Push…
            </button>
          )}
          {diverged && remote.token_set && (
            <button
              type="button"
              className={buttons.primary}
              disabled={pull.isPending}
              aria-busy={pull.isPending}
              onClick={() => {
                push.reset();
                pull.mutate({ name: remote.name, selection });
              }}
            >
              {pull.isPending ? "Pulling…" : `Pull from ${remote.name}`}
            </button>
          )}
        </div>
      )}
      {push.isError && <Notice title="The push didn't go through">{push.error.message}</Notice>}
      {push.isSuccess && <PushReportView report={push.data} name={remote.name} />}
      {pull.isError && <Notice title="The pull didn't go through">{pull.error.message}</Notice>}
      {pull.isSuccess && <PullReportView report={pull.data} name={remote.name} />}
    </section>
  );
}

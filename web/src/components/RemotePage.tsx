import type { ReactNode } from "react";
import { Link, useParams } from "react-router";

import type { ComponentStatus, LineageKind, ModelStatus, RemoteStatus } from "../api/types";
import { useEditor, useList, useRemoteStatus, useRemotes } from "../queries";
import {
  RELATION_TEXT,
  groupByRelation,
  lineageKey,
  lineagePath,
  shortDigest,
  type RelationGroup,
} from "../remotes";
import { classNames } from "../classNames";
import buttons from "./Buttons.module.css";
import list from "./ComponentList.module.css";
import { Skeleton } from "./ComponentList";
import detail from "./DetailPage.module.css";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";
import { TokenState } from "./RemoteList";
import styles from "./Remotes.module.css";

/** What the editor calls each kind of lineage, in a row. */
const KIND_WORDS: Readonly<Record<LineageKind, string>> = {
  workflow: "Workflow",
  tool: "Tool",
  benchmark: "Benchmark",
};

/** Returns a function naming each lineage by what this instance calls it, or by its id. */
function useNames(): (component: ComponentStatus) => string | null {
  const workflows = useList("workflows");
  const tools = useList("tools");
  const benchmarks = useList("benchmarks");

  return ({ lineage }) => {
    const found =
      lineage.kind === "workflow"
        ? workflows.data?.find((each) => each.id === lineage.id)
        : lineage.kind === "benchmark"
          ? benchmarks.data?.find((each) => each.id === lineage.id)
          : tools.data?.find((each) => each.id === lineage.id && each.version === lineage.version);

    return found === undefined ? null : found.name;
  };
}

function Side({
  number,
  digest,
  known,
}: {
  readonly number: number | null;
  readonly digest: string | null;
  readonly known: boolean;
}) {
  if (!known) {
    return <span className={styles.none}>unknown</span>;
  }

  if (number === null || digest === null) {
    return <span className={styles.none}>none</span>;
  }

  return (
    <span className={styles.side} title={digest}>
      <span>revision {number}</span>
      <code className={styles.mono}>{shortDigest(digest)}</code>
    </span>
  );
}

function Production({
  component,
  reachable,
}: {
  readonly component: ComponentStatus;
  readonly reachable: boolean;
}) {
  if (component.lineage.kind !== "workflow") {
    return null;
  }

  if (!reachable) {
    return <span className={styles.none}>unknown</span>;
  }

  const digest = component.remote_production_digest;

  return digest === null ? (
    <span className={styles.none}>not in production</span>
  ) : (
    <code className={styles.mono} title={digest}>
      {shortDigest(digest)}
    </code>
  );
}

function ComponentRow({
  component,
  name,
  reachable,
}: {
  readonly component: ComponentStatus;
  readonly name: string | null;
  readonly reachable: boolean;
}) {
  const { lineage } = component;
  const path = lineagePath(lineage, component.local_number !== null);
  const label = name ?? lineage.id;
  const version = lineage.version === null ? null : ` ${lineage.version}`;

  return (
    <tr>
      <td className={list.name}>
        <div className={list.nameStack}>
          {path === null ? (
            <span>
              {label}
              {version}
            </span>
          ) : (
            <Link className={list.link} to={path}>
              {label}
              {version}
            </Link>
          )}
          <span className={list.description}>{KIND_WORDS[lineage.kind]}</span>
        </div>
      </td>
      <td>
        <Side number={component.local_number} digest={component.local_digest} known />
      </td>
      <td>
        <Side number={component.remote_number} digest={component.remote_digest} known={reachable} />
      </td>
      <td>
        <Production component={component} reachable={reachable} />
      </td>
    </tr>
  );
}

function ComponentTable({
  components,
  reachable,
  nameOf,
}: {
  readonly components: readonly ComponentStatus[];
  readonly reachable: boolean;
  readonly nameOf: (component: ComponentStatus) => string | null;
}) {
  return (
    <table className={list.table}>
      <thead>
        <tr>
          <th scope="col">Component</th>
          <th scope="col">Here</th>
          <th scope="col">There</th>
          <th scope="col">In production there</th>
        </tr>
      </thead>
      <tbody>
        {components.map((component) => (
          <ComponentRow
            key={lineageKey(component.lineage)}
            component={component}
            name={nameOf(component)}
            reachable={reachable}
          />
        ))}
      </tbody>
    </table>
  );
}

function Group({
  group,
  reachable,
  nameOf,
}: {
  readonly group: RelationGroup;
  readonly reachable: boolean;
  readonly nameOf: (component: ComponentStatus) => string | null;
}) {
  const text =
    group.relation === null
      ? { label: "Unknown there", meaning: "The remote wasn't reached, so its side is unknown." }
      : RELATION_TEXT[group.relation];
  const count = <span className={styles.groupCount}>{String(group.components.length)}</span>;
  const table = (
    <ComponentTable components={group.components} reachable={reachable} nameOf={nameOf} />
  );

  if (group.relation === "in_sync") {
    return (
      <details className={classNames(styles.group, styles.folded)} data-relation="in_sync">
        <summary className={styles.groupTitle}>
          {text.label} {count}
        </summary>
        <p className={styles.meaning}>{text.meaning}</p>
        {table}
      </details>
    );
  }

  return (
    <section
      className={styles.group}
      data-relation={group.relation ?? "unknown"}
      aria-label={text.label}
    >
      <h2 className={styles.groupTitle}>
        {text.label} {count}
      </h2>
      <p className={styles.meaning}>{text.meaning}</p>
      {table}
    </section>
  );
}

function Authorized({ value }: { readonly value: boolean | null }) {
  if (value === null) {
    return <span className={styles.none}>unknown</span>;
  }

  return value ? <span className={styles.yes}>yes</span> : <span className={styles.no}>no</span>;
}

function Models({ models }: { readonly models: readonly ModelStatus[] }) {
  if (models.length === 0) {
    return null;
  }

  return (
    <section className={styles.group} aria-label="Models">
      <h2 className={styles.groupTitle}>Models</h2>
      <p className={styles.meaning}>
        A workflow runs only on models the instance it runs on authorizes.
      </p>
      <table className={list.table}>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Authorized here</th>
            <th scope="col">Authorized there</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.identifier}>
              <td>
                <code className={styles.mono}>{model.identifier}</code>
              </td>
              <td>
                <Authorized value={model.authorized_locally} />
              </td>
              <td>
                <Authorized value={model.authorized_remotely} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** What the status says of reaching the remote: nothing when it was reached. */
function Reach({ status }: { readonly status: RemoteStatus }) {
  if (status.reachable) {
    return null;
  }

  return (
    <Notice title="The remote isn't answering" tone="note">
      <p>
        What it holds is unknown until it answers again.{" "}
        {status.portfolio_synced_at === null ? (
          "Its models were never read here."
        ) : (
          <>
            Its models are as it last said, <RelativeTime iso={status.portfolio_synced_at} />.
          </>
        )}
      </p>
    </Notice>
  );
}

function Crumbs({ name }: { readonly name: string }) {
  return (
    <nav className={detail.crumbs} aria-label="Breadcrumb">
      <Link to="/remotes">Remotes</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{name}</span>
    </nav>
  );
}

/**
 * One named remote: how everything either side holds relates, what needs
 * a person first and what agrees folded away last, and where each model
 * is authorized. It asks again on its own while it is shown.
 */
export function RemotePage() {
  const { name = "" } = useParams();
  const remotes = useRemotes();
  const editor = useEditor();
  const named = remotes.data?.find((remote) => remote.name === name);
  const status = useRemoteStatus(name, {}, { enabled: named?.token_set === true });
  const nameOf = useNames();

  if (remotes.isPending) {
    return <Skeleton label="Loading the remote" />;
  }

  if (remotes.isError) {
    return <Notice title="Couldn't list the remotes">{remotes.error.message}</Notice>;
  }

  if (named === undefined) {
    return (
      <div className={detail.page}>
        <Crumbs name={name} />
        <Notice title={`No remote is named ${name}`}>
          <p>
            <Link to="/remotes">Name it on the Remotes page</Link>.
          </p>
        </Notice>
      </div>
    );
  }

  let body: ReactNode;

  if (!named.token_set) {
    body = (
      <Notice title={`${named.token_variable} isn't set`} tone="note">
        <p>
          The editor reads this remote&apos;s token from {named.token_variable}. Set it in a
          terminal, then launch <code>azathoth-ui</code> from it again.
        </p>
      </Notice>
    );
  } else if (status.isPending) {
    body = <Skeleton label="Asking the remote" />;
  } else if (status.isError) {
    body = <Notice title="Couldn't ask the remote">{status.error.message}</Notice>;
  } else {
    const groups = groupByRelation(status.data.components);

    body = (
      <>
        <Reach status={status.data} />
        {groups.length === 0 && (
          <p className={styles.meaning}>Neither side holds anything to compare.</p>
        )}
        {groups.map((group) => (
          <Group
            key={group.relation ?? "unknown"}
            group={group}
            reachable={status.data.reachable}
            nameOf={nameOf}
          />
        ))}
        <Models models={status.data.models} />
      </>
    );
  }

  const asOf = status.dataUpdatedAt === 0 ? null : new Date(status.dataUpdatedAt).toISOString();

  return (
    <div className={detail.page}>
      <Crumbs name={named.name} />
      <header className={list.header}>
        <div className={list.titles}>
          <h1 className={list.title}>{named.name}</h1>
          <p className={list.lead}>
            <code className={styles.mono}>{named.url}</code>
          </p>
          <TokenState remote={named} shell={editor.data?.shell ?? "posix"} />
        </div>
        {named.token_set && (
          <div className={list.actions}>
            {asOf !== null && (
              <span className={styles.when}>
                As of <RelativeTime iso={asOf} />
              </span>
            )}
            <button
              type="button"
              className={buttons.quiet}
              disabled={status.isFetching}
              aria-busy={status.isFetching}
              onClick={() => {
                void status.refetch();
              }}
            >
              {status.isFetching ? "Asking…" : "Refresh"}
            </button>
          </div>
        )}
      </header>
      {body}
    </div>
  );
}

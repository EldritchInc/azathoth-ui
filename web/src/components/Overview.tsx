import type { ApiFailure } from "../api/client";
import type { Backend, InstanceDescription } from "../api/types";
import type { Connection } from "../useInstance";
import { instanceName } from "../instanceName";
import { CopyButton } from "./CopyButton";
import { Orbits } from "./Orbits";
import styles from "./Overview.module.css";

const BACKENDS: Record<Backend, { readonly name: string; readonly article: string }> = {
  sqlite: { name: "SQLite", article: "An" },
  postgres: { name: "PostgreSQL", article: "A" },
};

function Problem({ failure }: { readonly failure: ApiFailure }) {
  let title: string;
  let detail: string;

  if (failure.code === "unauthenticated") {
    title = "This browser isn't signed in to this launch";
    detail =
      "Open the address azathoth-ui printed in your terminal. Each launch has its own key, " +
      "so an address from an earlier one no longer works.";
  } else if (failure.code === "unreachable") {
    title = "The editor's server isn't answering";
    detail =
      "If you stopped azathoth-ui, start it again and open the address it prints. " +
      "Until then, the editor keeps trying every 10 seconds.";
  } else {
    title = "The editor's server reported a problem";
    detail = failure.message;
  }

  return (
    <div className={styles.problem} role="alert">
      <p className={styles.problemTitle}>{title}</p>
      <p className={styles.problemDetail}>{detail}</p>
    </div>
  );
}

function Details({ instance }: { readonly instance: InstanceDescription }) {
  const stable = instance.api_stability === "stable";

  return (
    <dl className={styles.details}>
      <div className={styles.row}>
        <dt>Location</dt>
        <dd className={styles.location}>
          <code className={styles.path}>{instance.database}</code>
          <CopyButton text={instance.database} label="Copy location" />
        </dd>
      </div>
      <div className={styles.row}>
        <dt>Backend</dt>
        <dd>{BACKENDS[instance.backend].name}</dd>
      </div>
      <div className={styles.row}>
        <dt>Azathoth</dt>
        <dd>{instance.azathoth_version}</dd>
      </div>
      <div className={styles.row}>
        <dt>Schema</dt>
        <dd>Version {instance.schema_version}</dd>
      </div>
      <div className={styles.row}>
        <dt>Service API</dt>
        <dd>
          <span className={styles.badge} data-stable={stable}>
            {stable ? "Stable" : "Provisional"}
          </span>
          <span className={styles.note}>
            {stable
              ? "Its calls change only in a major release."
              : "Its calls may change in a minor release."}
          </span>
        </dd>
      </div>
    </dl>
  );
}

/** The editor's first page: the instance it serves, and how the connection is. */
export function Overview({ connection }: { readonly connection: Connection }) {
  const instance = connection.state === "connecting" ? null : connection.instance;
  let heading: string;
  let lead: string;

  if (instance !== null) {
    const backend = BACKENDS[instance.backend];
    heading = instanceName(instance);
    lead = `${backend.article} ${backend.name} instance, served by Azathoth ${instance.azathoth_version}.`;
  } else if (connection.state === "connecting") {
    heading = "Connecting";
    lead = "Asking the editor's server which instance it serves.";
  } else {
    heading = "No instance";
    lead = "The editor hasn't reached an instance yet.";
  }

  return (
    <div className={styles.overview}>
      {connection.state === "lost" && <Problem failure={connection.failure} />}
      <section className={styles.hero} aria-labelledby="instance-heading">
        <div className={styles.titles}>
          <h1 id="instance-heading" className={styles.heading} data-pending={instance === null}>
            {heading}
          </h1>
          <p className={styles.lead}>{lead}</p>
        </div>
        <div className={styles.drawing}>
          <Orbits quiet={connection.state !== "connected"} />
        </div>
      </section>
      {instance !== null && <Details instance={instance} />}
    </div>
  );
}

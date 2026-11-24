import type { ServiceDescription, ServiceJobs } from "../api/types";
import { useService } from "../queries";
import type { Connection } from "../useInstance";
import { Skeleton } from "./ComponentList";
import { Notice } from "./Notice";
import { InstanceDetails } from "./Overview";
import overview from "./Overview.module.css";
import { RelativeTime } from "./RelativeTime";
import styles from "./Remotes.module.css";

function counted(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** How a remote's jobs stand, and when what waits has no runner alive to start it. */
function Jobs({ jobs }: { readonly jobs: ServiceJobs | null }) {
  if (jobs === null) {
    return <dd>It runs no jobs.</dd>;
  }

  return (
    <dd className={styles.jobs}>
      <span>{`${String(jobs.queued)} waiting, ${String(jobs.running)} running`}</span>
      <span className={overview.note}>
        <span>{counted(jobs.runners, "runner alive", "runners alive")}</span>
        {jobs.oldest_queued_at !== null && (
          <>
            , the oldest submitted <RelativeTime iso={jobs.oldest_queued_at} />
          </>
        )}
      </span>
      {jobs.runners === 0 && jobs.queued > 0 && (
        <Notice title="No runner is alive" tone="note">
          <p>
            Runs, benchmark runs and optimizations on this remote wait for a runner, so nothing
            waiting starts until one runs there.
          </p>
        </Notice>
      )}
    </dd>
  );
}

/** What the remote says of the service API it serves: its edition, its protocol and its jobs. */
function Service({ service }: { readonly service: ServiceDescription }) {
  return (
    <dl className={overview.details} aria-label="Service">
      <div className={overview.row}>
        <dt>Edition</dt>
        <dd className={styles.edition}>
          <span>{service.edition}</span>
          {service.edition_detail !== null && (
            <span className={overview.note}>{service.edition_detail}</span>
          )}
        </dd>
      </div>
      <div className={overview.row}>
        <dt>Protocol</dt>
        <dd>Version {service.protocol}</dd>
      </div>
      <div className={overview.row}>
        <dt>Jobs</dt>
        <Jobs jobs={service.jobs} />
      </div>
    </dl>
  );
}

/**
 * The instance a remote serves, as its overview shows it (ADR 0016): where
 * its data is kept and the Azathoth serving it, the edition its policy
 * names and what it says more of it, and how its jobs stand. Nothing is
 * kept once the page no longer shows it.
 */
export function RemoteInstance({ connection }: { readonly connection: Connection }) {
  const service = useService();
  const instance = connection.state === "connecting" ? null : connection.instance;

  return (
    <section className={styles.group} aria-label="The instance there">
      <h2 className={styles.groupTitle}>The instance there</h2>
      {connection.state === "lost" && (
        <Notice title="Couldn't reach the instance there">{connection.failure.message}</Notice>
      )}
      {connection.state === "connecting" && <Skeleton label="Asking the instance there" />}
      {instance !== null && <InstanceDetails instance={instance} />}
      {service.isPending && service.fetchStatus !== "idle" && (
        <Skeleton label="Asking what the remote serves" />
      )}
      {service.isError && (
        <Notice title="Couldn't ask what the remote serves">{service.error.message}</Notice>
      )}
      {service.isSuccess && <Service service={service.data} />}
    </section>
  );
}

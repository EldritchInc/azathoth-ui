import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";

import type { NamedRemote, Shell } from "../api/types";
import { useEditor, useRemoteChange, useRemotes } from "../queries";
import { tokenCommand } from "../remotes";
import buttons from "./Buttons.module.css";
import list from "./ComponentList.module.css";
import { Skeleton } from "./ComponentList";
import { CopyButton } from "./CopyButton";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";
import styles from "./Remotes.module.css";

/** The default variable a remote's token is read from, as Azathoth's is. */
export const DEFAULT_TOKEN_VARIABLE = "AZATHOTH_REMOTE_TOKEN";

/**
 * Whether the editor can reach a remote with its token, and when it cannot,
 * the line that sets the variable. The editor reads the variable when it
 * asks, so setting it means relaunching the editor from a shell that has it.
 */
export function TokenState({
  remote,
  shell,
}: {
  readonly remote: NamedRemote;
  readonly shell: Shell;
}) {
  if (remote.token_set) {
    return (
      <span className={styles.token} data-set="true">
        <code className={styles.mono}>{remote.token_variable}</code>
      </span>
    );
  }

  const command = tokenCommand(remote.token_variable, shell);

  return (
    <span className={styles.token} data-set="false">
      <code className={styles.mono}>{remote.token_variable}</code>
      <span className={styles.unset}>not set</span>
      <CopyButton text={command} label={`Copy: ${command}`} />
    </span>
  );
}

function RemoteRow({
  remote,
  shell,
  onRemove,
  removing,
}: {
  readonly remote: NamedRemote;
  readonly shell: Shell;
  readonly onRemove: () => void;
  readonly removing: boolean;
}) {
  return (
    <tr>
      <td className={list.name}>
        <Link className={list.link} to={`/remotes/${encodeURIComponent(remote.name)}`}>
          {remote.name}
        </Link>
      </td>
      <td>
        <code className={styles.mono}>{remote.url}</code>
      </td>
      <td>
        <TokenState remote={remote} shell={shell} />
      </td>
      <td className={styles.when}>
        <RelativeTime iso={remote.added_at} />
      </td>
      <td>
        <button
          type="button"
          className={buttons.quiet}
          disabled={removing}
          aria-busy={removing}
          onClick={onRemove}
        >
          Forget <span className="visually-hidden">{remote.name}</span>
        </button>
      </td>
    </tr>
  );
}

/** The form that names a remote: its name, URL, and the variable its token is read from. */
function AddRemote() {
  const change = useRemoteChange();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [variable, setVariable] = useState("");
  const ids = { name: useId(), url: useId(), variable: useId() };
  const failed = change.isError && change.variables.add ? change.error : null;

  const submit = (): void => {
    change.mutate(
      {
        add: true,
        remote: { name: name.trim(), url: url.trim(), tokenVariable: variable.trim() },
      },
      {
        onSuccess: () => {
          setName("");
          setUrl("");
          setVariable("");
        },
      },
    );
  };

  return (
    <>
      <form
        className={styles.form}
        aria-label="Name a remote"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className={styles.field} htmlFor={ids.name}>
          Name
          <input
            id={ids.name}
            className={styles.input}
            value={name}
            placeholder="origin"
            autoComplete="off"
            spellCheck={false}
            required
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <label className={styles.field} htmlFor={ids.url}>
          URL
          <input
            id={ids.url}
            className={styles.input}
            type="url"
            value={url}
            placeholder="https://azathoth.example.com"
            autoComplete="off"
            spellCheck={false}
            required
            onChange={(event) => {
              setUrl(event.target.value);
            }}
          />
        </label>
        <label className={styles.field} htmlFor={ids.variable}>
          Token variable
          <input
            id={ids.variable}
            className={styles.input}
            value={variable}
            placeholder={DEFAULT_TOKEN_VARIABLE}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setVariable(event.target.value);
            }}
          />
        </label>
        <button
          type="submit"
          className={buttons.primary}
          disabled={change.isPending}
          aria-busy={change.isPending}
        >
          Name remote
        </button>
      </form>
      {failed !== null && <Notice title="Couldn't name the remote">{failed.message}</Notice>}
    </>
  );
}

/** Every remote the editor's instance names, to name another or forget one. */
export function RemoteList() {
  const remotes = useRemotes();
  const editor = useEditor();
  const change = useRemoteChange();
  const shell = editor.data?.shell ?? "posix";
  const removingName = change.isPending && !change.variables.add ? change.variables.name : null;
  const removalFailed = change.isError && !change.variables.add ? change.error : null;

  let body: ReactNode;

  if (remotes.isPending) {
    body = <Skeleton label="Loading remotes" />;
  } else if (remotes.isError) {
    body = <Notice title="Couldn't list the remotes">{remotes.error.message}</Notice>;
  } else if (remotes.data.length === 0) {
    body = (
      <div className={list.empty}>
        <p className={list.emptyTitle}>No remote is named yet</p>
        <p className={list.emptyText}>
          Name your team&apos;s remote below to see where your workflows stand there, ship them to
          it, and pull what others shipped.
        </p>
      </div>
    );
  } else {
    body = (
      <table className={list.table}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">URL</th>
            <th scope="col">Token</th>
            <th scope="col">Named</th>
            <th scope="col">
              <span className="visually-hidden">Forget</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {remotes.data.map((remote) => (
            <RemoteRow
              key={remote.name}
              remote={remote}
              shell={shell}
              removing={removingName === remote.name}
              onRemove={() => {
                change.mutate({ add: false, name: remote.name });
              }}
            />
          ))}
        </tbody>
      </table>
    );
  }

  const unset = (remotes.data ?? []).some((remote) => !remote.token_set);

  return (
    <div className={list.page}>
      <header className={list.header}>
        <div className={list.titles}>
          <h1 className={list.title}>Remotes</h1>
          <p className={list.lead}>
            The shared instances your workflows ship to. Each is named here with the environment
            variable its token is read from; the editor never sees the token itself.
          </p>
        </div>
      </header>
      {body}
      {unset && (
        <Notice title="A token isn't set" tone="note">
          <p>
            The editor reads each token from its own environment. Set the variable in a terminal,
            then launch <code>azathoth-ui</code> from it again.
          </p>
        </Notice>
      )}
      {removalFailed !== null && (
        <Notice title="Couldn't forget the remote">{removalFailed.message}</Notice>
      )}
      <AddRemote />
    </div>
  );
}

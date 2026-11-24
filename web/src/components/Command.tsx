import { useCommands } from "../queries";
import styles from "./Command.module.css";
import { CopyButton } from "./CopyButton";

/**
 * One `azathoth` command, as it runs against the instance the page acts on.
 *
 * What goes before and after it comes from the server, written for that
 * instance and quoted for this computer's shell (ADR 0009): the database
 * before it for the editor's own instance, `--remote <name>` after it for a
 * remote. Both are shown dimmed, and copied with the command.
 */
export function Command({ command }: { readonly command: string }) {
  const commands = useCommands();
  const prefix = commands.data?.prefix ?? "";
  const suffix = commands.data?.suffix ?? "";

  return (
    <div className={styles.command}>
      <code className={styles.line}>
        {prefix !== "" && <span className={styles.prefix}>{prefix}</span>}
        <span className={styles.text}>{command}</span>
        {suffix !== "" && <span className={styles.suffix}>{suffix}</span>}
      </code>
      <CopyButton text={prefix + command + suffix} label="Copy command" />
    </div>
  );
}

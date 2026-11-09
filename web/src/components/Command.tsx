import { useEditor } from "../queries";
import styles from "./Command.module.css";
import { CopyButton } from "./CopyButton";

/**
 * One `azathoth` command, as it runs against the editor's own database.
 *
 * The prefix that names the database comes from the server, quoted for this
 * computer's shell; it is shown dimmed, and copied with the command.
 */
export function Command({ command }: { readonly command: string }) {
  const editor = useEditor();
  const prefix = editor.data?.command_prefix ?? "";

  return (
    <div className={styles.command}>
      <code className={styles.line}>
        {prefix !== "" && <span className={styles.prefix}>{prefix}</span>}
        <span className={styles.text}>{command}</span>
      </code>
      <CopyButton text={prefix + command} label="Copy command" />
    </div>
  );
}

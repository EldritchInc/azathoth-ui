import { useMemo } from "react";

import { describeTool, type FieldView } from "../documents";
import styles from "./Structure.module.css";

function Fields({
  title,
  fields,
  empty,
}: {
  readonly title: string;
  readonly fields: readonly FieldView[];
  readonly empty: string;
}) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      {fields.length === 0 ? (
        <p className={styles.quiet}>{empty}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Type</th>
              <th scope="col">Description</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.name}>
                <td>
                  <code>{field.name}</code>
                  {field.required && <span className={styles.required}>required</span>}
                </td>
                <td className={styles.type}>{field.type}</td>
                <td className={styles.quiet}>{field.description ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** A tool version: its inputs and outputs, implementations, and tests. */
export function ToolStructure({
  document,
}: {
  readonly document: Readonly<Record<string, unknown>>;
}) {
  const view = useMemo(() => describeTool(document), [document]);

  return (
    <>
      <Fields title="Inputs" fields={view.inputs} empty="Its input schema names no fields." />
      <Fields title="Outputs" fields={view.outputs} empty="Its output schema names no fields." />
      <section className={styles.section} aria-label="Implementations">
        <h2 className={styles.title}>Implementations</h2>
        {view.implementations.length === 0 ? (
          <p className={styles.quiet}>This tool version has no implementation.</p>
        ) : (
          view.implementations.map((implementation, index) => (
            <article key={`${String(index)}-${implementation.id}`} className={styles.item}>
              <p className={styles.itemTitle}>
                {[
                  implementation.version === null ? null : `Version ${implementation.version}`,
                  implementation.runtime,
                  implementation.entrypoint === null
                    ? null
                    : `starts at ${implementation.entrypoint}`,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              {implementation.source !== null && (
                <details className={styles.source}>
                  <summary>Source</summary>
                  <pre>{implementation.source}</pre>
                </details>
              )}
            </article>
          ))
        )}
      </section>
      <section className={styles.section} aria-label="Tests">
        <h2 className={styles.title}>Tests</h2>
        {view.tests.length === 0 ? (
          <p className={styles.quiet}>This tool version has no tests.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Test</th>
                <th scope="col">Inputs</th>
                <th scope="col">Expects</th>
              </tr>
            </thead>
            <tbody>
              {view.tests.map((test, index) => (
                <tr key={`${String(index)}-${test.id}`}>
                  <td>
                    <span className={styles.strong}>{test.name}</span>
                    {test.description !== null && (
                      <span className={styles.quiet}>{test.description}</span>
                    )}
                  </td>
                  <td>
                    <code className={styles.value}>{test.inputs}</code>
                  </td>
                  <td>
                    <code className={styles.value}>{test.expected}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

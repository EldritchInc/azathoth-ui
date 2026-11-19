import { useId, useState } from "react";
import { useNavigate } from "react-router";

import { useCreateBenchmark } from "../queries";
import { usePage } from "../scope";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import styles from "./Benchmarks.module.css";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import layout from "./RunWorkflow.module.css";

/**
 * `/benchmarks/new`: a new, empty benchmark, from its name and what it
 * measures, and a version when it isn't 1.0.0: the `edit_benchmark` action
 * (ADR 0012). Its page opens once it is created, to add its cases.
 */
export function NewBenchmark() {
  const navigate = useNavigate();
  const page = usePage();
  const create = useCreateBenchmark();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("");
  const ids = { name: useId(), description: useId(), version: useId(), hint: useId() };
  const ready = name.trim() !== "" && description.trim() !== "";

  return (
    <div className={layout.page}>
      <nav className={layout.crumbs} aria-label="Breadcrumb">
        <InstanceLink to="/benchmarks">Benchmarks</InstanceLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">New</span>
      </nav>
      <header className={layout.header}>
        <h1 className={layout.title}>New benchmark</h1>
        <p className={layout.lead}>It starts with no cases, and can’t be run until one is added.</p>
      </header>
      <form
        className={layout.form}
        aria-label="New benchmark"
        onSubmit={(event) => {
          event.preventDefault();

          if (!ready || create.isPending) {
            return;
          }
          const trimmed = version.trim();

          create.mutate(
            {
              name: name.trim(),
              description: description.trim(),
              ...(trimmed === "" ? {} : { version: trimmed }),
            },
            {
              onSuccess: (created) => {
                void navigate(page(`/benchmarks/${encodeURIComponent(created.detail.id)}`));
              },
            },
          );
        }}
      >
        <div className={styles.field}>
          <label htmlFor={ids.name}>Name</label>
          <input
            id={ids.name}
            className={styles.input}
            value={name}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={ids.description}>Description</label>
          <textarea
            id={ids.description}
            className={styles.text}
            rows={2}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={ids.version}>Version</label>
          <input
            id={ids.version}
            className={styles.input}
            value={version}
            placeholder="1.0.0"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={ids.hint}
            onChange={(event) => {
              setVersion(event.target.value);
            }}
          />
          <span id={ids.hint} className={styles.hint}>
            Optional. It is 1.0.0 when left empty.
          </span>
        </div>
        {create.isError && (
          <Notice title="The benchmark wasn't created">{create.error.message}</Notice>
        )}
        <div className={layout.actions}>
          <ActionButton
            action="edit_benchmark"
            type="submit"
            className={buttons.primary}
            disabled={!ready || create.isPending}
            aria-busy={create.isPending}
          >
            {create.isPending ? "Creating…" : "Create benchmark"}
          </ActionButton>
          <InstanceLink className={buttons.quiet} to="/benchmarks">
            Cancel
          </InstanceLink>
        </div>
      </form>
    </div>
  );
}

import { useId, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { givenOf, NEW_DRAFT, type InputDraft } from "../runInput";
import { useDetail, useInvoke, useProduction } from "../queries";
import { instanceLabel, usePage, useScope } from "../scope";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import { InstanceLink } from "./InstanceLink";
import styles from "./InvokeWorkflow.module.css";
import { Notice } from "./Notice";
import { RunInput } from "./RunInput";
import page from "./RunWorkflow.module.css";

/**
 * `/workflows/:id/invoke`: invoke a workflow in production, as the editor
 * calls it (ADR 0010). It takes what a run takes, and an idempotency key
 * if one is named; the invocation is a live run, shown on its own page as
 * it runs, and production keeps it.
 */
export function InvokeWorkflow() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const pageOf = usePage();
  const scope = useScope();
  const detail = useDetail("workflows", { id }, null);
  const production = useProduction(id);
  const invoke = useInvoke();
  const [draft, setDraft] = useState<InputDraft>(NEW_DRAFT);
  const [key, setKey] = useState("");
  const keyId = useId();
  const hintId = useId();
  const { given } = givenOf(draft);
  const name = detail.data?.name ?? id;
  const where = instanceLabel(scope.name);
  const state = production.data;
  const absent = state === null;

  return (
    <div className={page.page}>
      <nav className={page.crumbs} aria-label="Breadcrumb">
        <InstanceLink to="/workflows">Workflows</InstanceLink>
        <span aria-hidden="true">/</span>
        <InstanceLink to={`/workflows/${id}`}>{name}</InstanceLink>
        <span aria-hidden="true">/</span>
        <InstanceLink to={`/workflows/${id}/production`}>Production</InstanceLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Invoke</span>
      </nav>
      <header className={page.header}>
        <h1 className={page.title}>Invoke {name}</h1>
        <p className={page.lead}>
          {state === undefined || state === null
            ? `It runs what production runs on ${where}, as any caller would.`
            : `Production runs ${
                state.workflow_revision === null
                  ? ""
                  : `revision ${String(state.workflow_revision)} of `
              }${name} on ${where}.`}{" "}
          Production keeps the invocation, with the editor as its caller.
        </p>
      </header>
      {detail.isError && (
        <Notice title="Couldn't load this workflow">
          <p>{detail.error.message}</p>
        </Notice>
      )}
      {production.isError && (
        <Notice title="Couldn't ask what production runs" tone="note">
          <p>
            {production.error.message} You can still invoke it; production will say if it can’t.
          </p>
        </Notice>
      )}
      {absent && (
        <Notice title={`${name} isn’t in production on ${where}`} tone="note">
          <p>
            Promote it from{" "}
            <InstanceLink to={`/workflows/${id}/production`}>its Production tab</InstanceLink>{" "}
            first, and then invoke it.
          </p>
        </Notice>
      )}
      <form
        className={page.form}
        onSubmit={(event) => {
          event.preventDefault();

          if (given === null || invoke.isPending) {
            return;
          }

          const named = key.trim();

          invoke.mutate(
            named === ""
              ? { workflowId: id, given }
              : { workflowId: id, given, idempotencyKey: named },
            {
              onSuccess: (run) => {
                void navigate(pageOf(`/live/${run.handle}`));
              },
            },
          );
        }}
      >
        <RunInput draft={draft} onChange={setDraft} />
        <div className={styles.field}>
          <label className={styles.label} htmlFor={keyId}>
            Idempotency key
          </label>
          <input
            id={keyId}
            className={styles.input}
            type="text"
            value={key}
            placeholder="Optional"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby={hintId}
            onChange={(event) => {
              setKey(event.target.value);
            }}
          />
          <p id={hintId} className={styles.hint}>
            Invoke again under the same key, and production answers with the first invocation’s
            outcome rather than running it again.
          </p>
        </div>
        {invoke.isError && (
          <Notice title="The invocation didn't start">
            <p>{invoke.error.message}</p>
          </Notice>
        )}
        <div className={page.actions}>
          <ActionButton
            action="invoke"
            subject={id}
            type="submit"
            className={buttons.primary}
            disabled={given === null || invoke.isPending || production.isPending || absent}
          >
            {invoke.isPending ? "Invoking…" : "Invoke"}
          </ActionButton>
          <InstanceLink className={buttons.quiet} to={`/workflows/${id}/production`}>
            Cancel
          </InstanceLink>
        </div>
      </form>
    </div>
  );
}

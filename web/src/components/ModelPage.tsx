import type { ReactNode } from "react";
import { Link, useParams } from "react-router";

import type { ModelSummary } from "../api/types";
import { formatPrice, formatTokens, labelOf, nameOf } from "../models";
import { useModels, usePortfolio, usePortfolioChange, useWorkflowDocuments } from "../queries";
import { stepsThatCouldUse, type Use } from "../selection";
import buttons from "./Buttons.module.css";
import { Command } from "./Command";
import { CopyButton } from "./CopyButton";
import detail from "./DetailPage.module.css";
import styles from "./ModelPage.module.css";
import { Notice } from "./Notice";
import { PortfolioOutcome, type Change } from "./Portfolio";

function Crumbs({ name }: { readonly name: string }) {
  return (
    <nav className={detail.crumbs} aria-label="Breadcrumb">
      <Link to="/models">Models</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{name}</span>
    </nav>
  );
}

function Known({ children }: { readonly children: string }) {
  return children === "unknown" ? <span className={styles.unknown}>Not published</span> : children;
}

function Tags({ names }: { readonly names: readonly string[] }) {
  return names.length === 0 ? (
    <span className={styles.unknown}>None known</span>
  ) : (
    <ul className={styles.tags}>
      {names.map((name) => (
        <li key={name}>{labelOf(name)}</li>
      ))}
    </ul>
  );
}

/** Whether the local portfolio holds a model, and the button that changes it. */
function PortfolioPanel({
  identifier,
  held,
  change,
}: {
  readonly identifier: string;
  readonly held: boolean;
  readonly change: Change;
}) {
  const changing = change.isPending && change.variables.identifier === identifier;

  return (
    <section className={styles.panel} aria-label="Local portfolio" data-held={held}>
      <p className={styles.panelTitle}>
        {held ? "In your local portfolio" : "Not in your local portfolio"}
      </p>
      <p className={styles.panelText}>
        {held
          ? "Steps here may choose it, or run on it always."
          : "Steps here can't run on it until it is added."}{" "}
        Only this editor&apos;s instance changes; a shared server keeps its own.
      </p>
      <button
        type="button"
        className={held ? buttons.quiet : buttons.primary}
        disabled={changing}
        aria-busy={changing}
        onClick={() => {
          change.mutate({ identifier, add: !held });
        }}
      >
        {held ? "Remove from local portfolio" : "Add to local portfolio"}
      </button>
    </section>
  );
}

/** The steps of local workflows that could run on a model, grouped by workflow. */
function Uses({
  uses,
  pending,
  failed,
  held,
}: {
  readonly uses: readonly Use[];
  readonly pending: boolean;
  readonly failed: boolean;
  readonly held: boolean;
}) {
  const workflows = [...new Map(uses.map((use) => [use.workflowId, use.workflowName]))];

  let body: ReactNode;

  if (uses.length === 0) {
    body = (
      <p className={styles.quiet}>
        {pending
          ? "Looking through your workflows…"
          : "No step of your local workflows needs only what it offers, or always runs on it."}
      </p>
    );
  } else {
    body = (
      <ul className={styles.workflows}>
        {workflows.map(([id, workflowName]) => (
          <li key={id}>
            <Link className={styles.workflow} to={`/workflows/${id}`}>
              {workflowName}
            </Link>
            <ul className={styles.steps}>
              {uses
                .filter((use) => use.workflowId === id)
                .map((use) => (
                  <li key={use.stepId}>
                    <Link to={`/workflows/${id}?step=${encodeURIComponent(use.stepId)}`}>
                      {use.step}
                    </Link>
                    {use.fixed && <span className={styles.always}>always runs on it</span>}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className={styles.uses} aria-labelledby="model-uses">
      <h2 id="model-uses" className={styles.heading}>
        Steps that could run on it
      </h2>
      <p className={styles.quiet}>
        Prompt steps of the workflows in your local instance whose needs it meets, by
        Azathoth&apos;s rules, and those that always run on it.
        {!held && uses.length > 0 && " Add it to your local portfolio for them to choose it."}
      </p>
      {failed && (
        <Notice title="Some workflows couldn't be read" tone="note">
          <p>Their steps are left out.</p>
        </Notice>
      )}
      {body}
    </section>
  );
}

function Facts({ model }: { readonly model: ModelSummary }) {
  return (
    <dl className={styles.facts}>
      <div>
        <dt>Context window</dt>
        <dd>
          <Known>{formatTokens(model.context_window_tokens)}</Known>
        </dd>
      </div>
      <div>
        <dt>Longest answer</dt>
        <dd>
          <Known>{formatTokens(model.maximum_output_tokens)}</Known>
        </dd>
      </div>
      <div>
        <dt>Input, a million tokens</dt>
        <dd>
          <Known>{formatPrice(model.input_usd_per_million_tokens)}</Known>
        </dd>
      </div>
      <div>
        <dt>Output, a million tokens</dt>
        <dd>
          <Known>{formatPrice(model.output_usd_per_million_tokens)}</Known>
        </dd>
      </div>
      <div className={styles.wide}>
        <dt>Reads</dt>
        <dd>
          <Tags names={model.input_modalities} />
        </dd>
      </div>
      <div className={styles.wide}>
        <dt>Writes</dt>
        <dd>
          <Tags names={model.output_modalities} />
        </dd>
      </div>
      <div className={styles.wide}>
        <dt>Can</dt>
        <dd>
          <Tags names={model.capabilities} />
        </dd>
      </div>
    </dl>
  );
}

/**
 * One model the providers serve: everything known of it, whether the local
 * portfolio holds it, and the steps of local workflows that could run on
 * it. A model the providers no longer serve still shows, while the local
 * portfolio holds it, so it can be removed.
 */
export function ModelPage() {
  const identifier = useParams()["*"] ?? "";
  const models = useModels();
  const portfolio = usePortfolio();
  const change = usePortfolioChange();
  const documents = useWorkflowDocuments();
  const model = models.data?.items.find((each) => each.identifier === identifier);
  const entry = portfolio.data?.find((each) => each.identifier === identifier);

  if (models.isPending || (model === undefined && portfolio.isPending)) {
    return (
      <div className={detail.page}>
        <Crumbs name={identifier} />
        <p className={detail.loading} role="status">
          Loading this model…
        </p>
      </div>
    );
  }

  if (model === undefined) {
    return (
      <div className={detail.page}>
        <Crumbs name={identifier} />
        {models.isError && <Notice title="Couldn't list the models">{models.error.message}</Notice>}
        {entry === undefined ? (
          !models.isError && (
            <Notice title="No model at this address">
              <p>Your providers don&apos;t serve {identifier} now.</p>
              <p>
                <Link className={detail.back} to="/models">
                  Back to models
                </Link>
              </p>
            </Notice>
          )
        ) : (
          <>
            <header className={detail.titles}>
              <h1 className={detail.title}>{identifier}</h1>
              <p className={detail.lead}>
                Your local portfolio holds it, but your providers don&apos;t serve it now, so no
                step can run on it.
              </p>
            </header>
            <PortfolioOutcome change={change} models={[]} />
            <PortfolioPanel identifier={identifier} held change={change} />
          </>
        )}
      </div>
    );
  }

  const name = nameOf(model);
  const uses = stepsThatCouldUse(model, documents.workflows);

  return (
    <div className={detail.page}>
      <Crumbs name={name} />
      <header className={styles.header}>
        <div className={detail.titles}>
          <h1 className={detail.title}>{name}</h1>
          <div className={styles.identity}>
            <code className={styles.identifier}>{model.identifier}</code>
            <CopyButton text={model.identifier} label="Copy the identifier" />
          </div>
          <p className={detail.lead}>
            Served by <span className={styles.provider}>{model.provider}</span>
            {model.display_name !== null && (
              <>
                , which calls it <span className={styles.provider}>{model.model}</span>
              </>
            )}
            .
          </p>
        </div>
        <PortfolioPanel identifier={model.identifier} held={model.authorized} change={change} />
      </header>
      <PortfolioOutcome change={change} models={[model]} />
      <Facts model={model} />
      <Command command={model.command} />
      <Uses
        uses={uses}
        pending={documents.pending}
        failed={documents.failed}
        held={model.authorized}
      />
    </div>
  );
}

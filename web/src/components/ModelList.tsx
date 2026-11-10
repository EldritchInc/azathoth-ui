import { useId, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import type { ModelSummary } from "../api/types";
import { classNames } from "../classNames";
import {
  CAPABILITIES,
  MODALITIES,
  SORTS,
  filterOf,
  formatPrice,
  formatTokens,
  labelOf,
  modelPath,
  nameOf,
  narrows,
  NO_FILTER,
  providersOf,
  searchOf,
  shownModels,
  type ModelFilter,
} from "../models";
import { useEditor, useModels, usePortfolioChange, useRefreshModels } from "../queries";
import buttons from "./Buttons.module.css";
import { Skeleton } from "./ComponentList";
import list from "./ComponentList.module.css";
import { CopyButton } from "./CopyButton";
import styles from "./ModelList.module.css";
import { Notice } from "./Notice";
import { PortfolioOutcome, PortfolioToggle, type Change } from "./Portfolio";
import { RelativeTime } from "./RelativeTime";

const CONTEXTS: readonly (readonly [number | null, string])[] = [
  [null, "Any context"],
  [32_000, "32K or more"],
  [128_000, "128K or more"],
  [200_000, "200K or more"],
  [1_000_000, "1M or more"],
];

const PRICES: readonly (number | null)[] = [null, 0, 0.5, 1, 3, 5, 15];

/** How each provider is turned on, as the editor's own command reads its environment. */
const TURNING_ON = "export OPENROUTER_API_KEY=sk-or-…\nexport AZATHOTH_BEDROCK=1\nazathoth-ui";

function Unknown({ children }: { readonly children: string }) {
  return children === "unknown" ? <span className={styles.unknown}>unknown</span> : children;
}

function Chip({
  pressed,
  onToggle,
  children,
}: {
  readonly pressed: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button type="button" className={styles.chip} aria-pressed={pressed} onClick={onToggle}>
      {children}
    </button>
  );
}

function toggled(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((each) => each !== value) : [...values, value];
}

function amountOf(value: string): number | null {
  return value === "" ? null : Number(value);
}

/** The controls that narrow the catalog, and its order. */
function Filters({
  filter,
  providers,
  onChange,
}: {
  readonly filter: ModelFilter;
  readonly providers: readonly string[];
  readonly onChange: (change: Partial<ModelFilter>) => void;
}) {
  const reads = useId();
  const can = useId();

  return (
    <div className={styles.filters} role="group" aria-label="Narrow the models">
      <div className={styles.chips}>
        <span className={styles.chipsLabel} id={reads}>
          Reads
        </span>
        <div className={styles.chipRow} role="group" aria-labelledby={reads}>
          {MODALITIES.map(([modality, label]) => (
            <Chip
              key={modality}
              pressed={filter.reads.includes(modality)}
              onToggle={() => {
                onChange({ reads: toggled(filter.reads, modality) });
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>
      <div className={styles.chips}>
        <span className={styles.chipsLabel} id={can}>
          Can
        </span>
        <div className={styles.chipRow} role="group" aria-labelledby={can}>
          {CAPABILITIES.map(([capability, label]) => (
            <Chip
              key={capability}
              pressed={filter.can.includes(capability)}
              onToggle={() => {
                onChange({ can: toggled(filter.can, capability) });
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>
      <div className={styles.selects}>
        {providers.length > 1 && (
          <select
            className={styles.select}
            aria-label="Provider"
            value={filter.provider ?? ""}
            onChange={(event) => {
              onChange({ provider: event.target.value === "" ? null : event.target.value });
            }}
          >
            <option value="">Every provider</option>
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        )}
        <select
          className={styles.select}
          aria-label="Context"
          value={filter.context === null ? "" : String(filter.context)}
          onChange={(event) => {
            onChange({ context: amountOf(event.target.value) });
          }}
        >
          {CONTEXTS.map(([tokens, label]) => (
            <option key={label} value={tokens === null ? "" : String(tokens)}>
              {label}
            </option>
          ))}
          {!CONTEXTS.some(([tokens]) => tokens === filter.context) && filter.context !== null && (
            <option value={String(filter.context)}>{formatTokens(filter.context)} or more</option>
          )}
        </select>
        {(["inputPrice", "outputPrice"] as const).map((field) => {
          const value = filter[field];
          const side = field === "inputPrice" ? "Input" : "Output";

          return (
            <select
              key={field}
              className={styles.select}
              aria-label={`${side} price`}
              value={value === null ? "" : String(value)}
              onChange={(event) => {
                const price = amountOf(event.target.value);

                onChange(field === "inputPrice" ? { inputPrice: price } : { outputPrice: price });
              }}
            >
              {PRICES.map((price) => (
                <option key={String(price)} value={price === null ? "" : String(price)}>
                  {price === null
                    ? `${side} at any price`
                    : price === 0
                      ? `${side} free`
                      : `${side} at most ${formatPrice(price)}`}
                </option>
              ))}
              {value !== null && !PRICES.includes(value) && (
                <option value={String(value)}>{`${side} at most ${formatPrice(value)}`}</option>
              )}
            </select>
          );
        })}
        <Chip
          pressed={filter.mine}
          onToggle={() => {
            onChange({ mine: !filter.mine });
          }}
        >
          Only my local portfolio
        </Chip>
      </div>
    </div>
  );
}

function Tags({ names, kind }: { readonly names: readonly string[]; readonly kind: string }) {
  return names.length === 0 ? (
    <span className={styles.unknown}>none known</span>
  ) : (
    <ul className={styles.tags} data-kind={kind}>
      {names.map((name) => (
        <li key={name}>{labelOf(name)}</li>
      ))}
    </ul>
  );
}

function ModelRow({ model, change }: { readonly model: ModelSummary; readonly change: Change }) {
  return (
    <tr data-authorized={model.authorized}>
      <td className={list.name}>
        <div className={list.nameStack}>
          <Link className={list.link} to={modelPath(model.identifier)}>
            {nameOf(model)}
          </Link>
          <code className={styles.identifier}>{model.identifier}</code>
        </div>
      </td>
      <td className={list.number} data-label="Context">
        <Unknown>{formatTokens(model.context_window_tokens)}</Unknown>
      </td>
      <td className={list.number} data-label="Input">
        <Unknown>{formatPrice(model.input_usd_per_million_tokens)}</Unknown>
      </td>
      <td className={list.number} data-label="Output">
        <Unknown>{formatPrice(model.output_usd_per_million_tokens)}</Unknown>
      </td>
      <td data-label="Reads">
        <Tags names={model.input_modalities} kind="modality" />
      </td>
      <td data-label="Can">
        <Tags names={model.capabilities} kind="capability" />
      </td>
      <td className={styles.portfolio}>
        <PortfolioToggle model={model} change={change} />
      </td>
    </tr>
  );
}

/** How to turn a provider on, when the editor was opened with none. */
function NoProviders() {
  return (
    <div className={list.empty}>
      <p className={list.emptyTitle}>No providers are turned on</p>
      <p className={list.emptyText}>
        The editor lists what OpenRouter or Amazon Bedrock serve once it is opened with either
        turned on. Set OpenRouter&apos;s key, or turn Bedrock on with your AWS credentials, then
        open the editor again:
      </p>
      <div className={styles.setup}>
        <pre className={styles.setupText}>{TURNING_ON}</pre>
        <CopyButton text={TURNING_ON} label="Copy the commands" />
      </div>
    </div>
  );
}

/**
 * The models the providers serve now, to narrow, compare and keep in the
 * local portfolio. The portfolio here is this editor's own: changing it
 * never touches a shared server, whose models are its own.
 */
export function ModelList() {
  const editor = useEditor();
  const models = useModels();
  const refresh = useRefreshModels();
  const change = usePortfolioChange();
  const [params, setParams] = useSearchParams();
  const filter = filterOf(params);
  const filterId = useId();
  const all = models.data?.items ?? [];
  const shown = shownModels(all, filter);
  const kept = all.filter((model) => model.authorized).length;
  const off = editor.data?.providers.length === 0;

  const update = (next: Partial<ModelFilter>): void => {
    setParams(searchOf({ ...filter, ...next }), { replace: true });
  };

  let body: ReactNode;

  if (off) {
    body = <NoProviders />;
  } else if (models.isPending) {
    body = <Skeleton label="Loading models" />;
  } else if (models.isError) {
    body = <Notice title="Couldn't list the models">{models.error.message}</Notice>;
  } else if (all.length === 0) {
    body = (
      <div className={list.empty}>
        <p className={list.emptyTitle}>The providers serve no models</p>
        <p className={list.emptyText}>
          They answered, with nothing in the catalog. Refresh to ask them again.
        </p>
      </div>
    );
  } else if (shown.length === 0) {
    body = (
      <Notice title="No models match" tone="note">
        <p>
          <button
            type="button"
            className={list.clear}
            onClick={() => {
              setParams(searchOf({ ...NO_FILTER, sort: filter.sort }), { replace: true });
            }}
          >
            Clear the filters
          </button>
        </p>
      </Notice>
    );
  } else {
    body = (
      <table className={classNames(list.table, styles.table)}>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col" className={list.number}>
              Context
            </th>
            <th scope="col" className={list.number} title="For a million tokens">
              Input
            </th>
            <th scope="col" className={list.number} title="For a million tokens">
              Output
            </th>
            <th scope="col">Reads</th>
            <th scope="col">Can</th>
            <th scope="col" className={styles.portfolio}>
              Local portfolio
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((model) => (
            <ModelRow key={model.identifier} model={model} change={change} />
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className={list.page}>
      <header className={list.header}>
        <div className={list.titles}>
          <h1 className={list.title}>Models</h1>
          <p className={list.lead}>
            What your providers serve now. Your local portfolio is the models workflows in this
            editor may use; it is yours to change, and a shared server keeps its own.
          </p>
        </div>
        {models.data !== undefined && !off && (
          <div className={list.actions}>
            <span className={styles.listed}>
              Asked <RelativeTime iso={models.data.listed_at} />
            </span>
            <button
              type="button"
              className={buttons.quiet}
              disabled={refresh.isPending}
              aria-busy={refresh.isPending}
              onClick={() => {
                refresh.mutate();
              }}
            >
              <svg
                className={styles.refresh}
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v3.5h3.5M4 13a8 8 0 0 0 14.6 4.5M20 20v-3.5h-3.5" />
              </svg>
              {refresh.isPending ? "Asking…" : "Refresh"}
            </button>
          </div>
        )}
      </header>
      {refresh.isError && (
        <Notice title="Couldn't ask the providers again">{refresh.error.message}</Notice>
      )}
      <PortfolioOutcome change={change} models={all} />
      {all.length > 0 && !off && (
        <>
          <div className={list.toolbar}>
            <label className="visually-hidden" htmlFor={filterId}>
              Filter models
            </label>
            <input
              id={filterId}
              className={list.filter}
              type="search"
              value={filter.text}
              placeholder="Filter by name or identifier"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                update({ text: event.target.value });
              }}
            />
            <p className={list.count} aria-live="polite">
              {narrows(filter)
                ? `${String(shown.length)} of ${String(all.length)} models`
                : `${String(all.length)} models`}
              {` · ${String(kept)} in your local portfolio`}
            </p>
            {narrows(filter) && (
              <button
                type="button"
                className={list.clear}
                onClick={() => {
                  setParams(searchOf({ ...NO_FILTER, sort: filter.sort }), { replace: true });
                }}
              >
                Clear the filters
              </button>
            )}
            <select
              className={classNames(styles.select, styles.order)}
              aria-label="Order"
              value={filter.sort}
              onChange={(event) => {
                const sort = SORTS.find(([each]) => each === event.target.value)?.[0];

                if (sort !== undefined) {
                  update({ sort });
                }
              }}
            >
              {SORTS.map(([sort, label]) => (
                <option key={sort} value={sort}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Filters filter={filter} providers={providersOf(all)} onChange={update} />
        </>
      )}
      {body}
    </div>
  );
}

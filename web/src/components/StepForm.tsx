import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router";

import {
  addCondition,
  addDependency,
  addInput,
  addOutput,
  asList,
  asObject,
  asText,
  canConnect,
  idOf,
  isObject,
  removeCondition,
  removeInput,
  removeOutput,
  renameInput,
  renameOutput,
  replaceStep,
  setCondition,
  setFailurePolicy,
  setInputSource,
  setMessage,
  setOutputFormat,
  setOutputPath,
  setPromptText,
  setRequirements,
  setResult,
  setRetry,
  setStepDescription,
  setStepName,
  setTool,
  sourceOf,
  stepsOf,
  upstreamOf,
  variablesOf,
  WORKFLOW_INPUT,
  type FailurePolicy,
  type JsonObject,
  type JsonValue,
  type Operator,
  type Source,
} from "../editing";
import {
  formatConstant,
  formatPath,
  highlightParts,
  namesFromDependencies,
  parseConstant,
  parsePath,
  sourceChoices,
  type Choice,
} from "../forms";
import { titleOf } from "../problems";
import { modelPath, nameOf, searchOf } from "../models";
import { useList, useMatching, useModels } from "../queries";
import { filterFor, meets, needsOf } from "../selection";
import { useDebounced } from "../useDebounced";
import styles from "./StepForm.module.css";
import type { Composing, Edit } from "./composing";
import { JsonEditor } from "./JsonEditor";

/** What every part of the form needs: the step, its document, and a way to change it. */
interface Editing {
  readonly id: string;
  readonly step: JsonObject;
  readonly document: JsonObject;
  readonly change: (edit: Edit, group?: string) => void;
}

const SOURCE_KINDS: readonly (readonly [Source["kind"], string])[] = [
  ["input", "The workflow's input"],
  ["step", "A step's output"],
  ["context", "By name, from a step it runs after"],
  ["constant", "A constant"],
];

const OPERATORS: readonly (readonly [Operator, string])[] = [
  ["equal", "is"],
  ["not_equal", "is not"],
  ["greater_than", "is more than"],
  ["greater_than_or_equal", "is at least"],
  ["less_than", "is less than"],
  ["less_than_or_equal", "is at most"],
];

const FAILURE_POLICIES: readonly (readonly [FailurePolicy, string])[] = [
  ["fail_workflow", "Stop the workflow"],
  ["continue", "Go on without it"],
  ["skip_dependents", "Skip the steps after it"],
];

const CAPABILITIES: readonly (readonly [string, string])[] = [
  ["structured_output", "Structured output"],
  ["tool_use", "Tool use"],
  ["vision", "Vision"],
  ["streaming", "Streaming"],
];

function numberOf(value: JsonValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function keyOf(choice: { readonly step: string; readonly name: string }): string {
  return `${choice.step}\n${choice.name}`;
}

/** Returns the document with a step running after another it is to read from, when it does not yet. */
function reading(document: JsonObject, id: string, from: string): JsonObject {
  return !upstreamOf(document, id).has(from) && canConnect(document, from, id)
    ? addDependency(document, id, from)
    : document;
}

/** Returns what a constant is, in a word or two. */
function kindOfConstant(value: JsonValue): string {
  if (value === null) {
    return "nothing";
  }
  if (Array.isArray(value)) {
    return "a list";
  }
  switch (typeof value) {
    case "string":
      return "text";
    case "number":
      return "a number";
    case "boolean":
      return "yes or no";
    default:
      return "an object";
  }
}

function Section({
  title,
  shown = true,
  children,
}: {
  readonly title: string;
  readonly shown?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-label={title}>
      {shown && <h4 className={styles.sectionTitle}>{title}</h4>}
      {children}
    </section>
  );
}

/** A labelled field: the control is given the id its label names. */
function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: ReactNode;
  readonly children: (id: string) => ReactNode;
}) {
  const id = useId();

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint !== undefined && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur">;

/**
 * A field whose text reads into something else, such as a path or a
 * number: it keeps what is typed while the value it was read into still
 * shows as that text, so typing is never undone halfway, and shows the
 * value again once it changes some other way, such as by undoing.
 */
function DraftInput({
  value,
  commit,
  ...rest
}: InputProps & {
  readonly value: string;
  /** Reads the text in, and returns how the value it was read into shows. */
  readonly commit: (text: string) => string;
}) {
  const [draft, setDraft] = useState<{ readonly text: string; readonly shows: string } | null>(
    null,
  );

  return (
    <input
      {...rest}
      className={styles.input}
      value={draft !== null && draft.shows === value ? draft.text : value}
      onChange={(event) => {
        const text = event.target.value;

        setDraft({ text, shows: commit(text) });
      }}
      onBlur={() => {
        setDraft(null);
      }}
    />
  );
}

function NumberInput({
  value,
  nullable = false,
  onNumber,
  ...rest
}: InputProps & {
  readonly value: number | null;
  readonly nullable?: boolean;
  readonly onNumber: (value: number | null) => void;
}) {
  const shown = value === null ? "" : String(value);

  return (
    <DraftInput
      {...rest}
      type="number"
      inputMode="decimal"
      value={shown}
      commit={(text) => {
        if (text.trim() === "") {
          if (nullable) {
            onNumber(null);
            return "";
          }
          return shown;
        }

        const number = Number(text);

        if (!Number.isFinite(number)) {
          return shown;
        }
        onNumber(number);
        return String(number);
      }}
    />
  );
}

function RemoveButton({
  label,
  onRemove,
}: {
  readonly label: string;
  readonly onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.remove}
      aria-label={label}
      title={label}
      onClick={onRemove}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M7 7l10 10M17 7 7 17" />
      </svg>
    </button>
  );
}

function AddButton({
  children,
  disabled = false,
  title,
  onAdd,
}: {
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly onAdd: () => void;
}) {
  return (
    <button type="button" className={styles.add} disabled={disabled} title={title} onClick={onAdd}>
      {children}
    </button>
  );
}

/** A choice of the outputs a step can read, and the one it reads now even when it cannot. */
function ChoiceSelect({
  label,
  current,
  choices,
  document,
  onChoose,
}: {
  readonly label: string;
  readonly current: { readonly step: string; readonly name: string } | null;
  readonly choices: readonly Choice[];
  readonly document: JsonObject;
  readonly onChoose: (choice: Choice) => void;
}) {
  const known = current !== null && choices.some((choice) => keyOf(choice) === keyOf(current));
  const producer =
    current === null ? undefined : stepsOf(document).find((step) => idOf(step) === current.step);

  return (
    <select
      aria-label={label}
      className={styles.select}
      value={current === null ? "" : keyOf(current)}
      onChange={(event) => {
        const choice = choices.find((each) => keyOf(each) === event.target.value);

        if (choice !== undefined) {
          onChoose(choice);
        }
      }}
    >
      {current === null && (
        <option value="" disabled>
          Choose an output
        </option>
      )}
      {current !== null && !known && (
        <option value={keyOf(current)} disabled>
          {`${producer === undefined ? "A step not in the workflow" : titleOf(producer)} · ${current.name}`}
        </option>
      )}
      {choices.map((choice) => (
        <option key={keyOf(choice)} value={keyOf(choice)}>
          {`${choice.title} · ${choice.name}${choice.upstream ? "" : " (runs it after)"}`}
        </option>
      ))}
    </select>
  );
}

// What the step is.

function About({ editing, prompt }: { readonly editing: Editing; readonly prompt: boolean }) {
  const { id, step, change } = editing;
  const metadata = asObject(asObject(step.specification).metadata);

  return (
    <Section title="About" shown={false}>
      {prompt && (
        <>
          <Field label="Its name">
            {(field) => (
              <input
                id={field}
                className={styles.input}
                value={asText(metadata.name) ?? ""}
                onChange={(event) => {
                  const name = event.target.value;

                  change((current) => setStepName(current, id, name), `${id}.name`);
                }}
              />
            )}
          </Field>
          <Field label="What it does">
            {(field) => (
              <textarea
                id={field}
                className={styles.textarea}
                rows={2}
                value={asText(metadata.description) ?? ""}
                onChange={(event) => {
                  const description = event.target.value;

                  change(
                    (current) => setStepDescription(current, id, description),
                    `${id}.description`,
                  );
                }}
              />
            )}
          </Field>
        </>
      )}
      <Field label="Says as it runs">
        {(field) => (
          <input
            id={field}
            className={styles.input}
            placeholder="Nothing"
            value={asText(step.message) ?? ""}
            onChange={(event) => {
              const message = event.target.value;

              change((current) => setMessage(current, id, message), `${id}.message`);
            }}
          />
        )}
      </Field>
    </Section>
  );
}

// What a prompt step asks, and of what model.

function Prompt({
  editing,
  choices,
}: {
  readonly editing: Editing;
  readonly choices: readonly Choice[];
}) {
  const { id, step, change } = editing;
  const specification = asObject(step.specification);
  const template = isObject(specification.template) ? specification.template : null;
  const text = asText(template?.text ?? asObject(specification.prompt).text) ?? "";
  const inputs = asList(step.inputs).map((input) => asText(asObject(input).name) ?? "");
  const bindings = asList(template?.bindings).filter(isObject);
  const bound = new Map(
    bindings.flatMap((binding) => {
      const variable = asText(binding.variable_name);
      const input = asText(binding.input_name);

      return variable !== null && input !== null && inputs.includes(input)
        ? [[variable, input] as const]
        : [];
    }),
  );
  const variables = template === null ? [] : variablesOf(text);
  const json = specification.output_format === "json";

  const addVariable = (variable: string): void => {
    const choice = choices.find((each) => each.name === variable);

    change((current) =>
      choice === undefined
        ? addInput(current, id, variable, WORKFLOW_INPUT)
        : addInput(reading(current, id, choice.step), id, variable, {
            kind: "step",
            step: choice.step,
            name: choice.name,
          }),
    );
  };

  return (
    <Section title="Prompt">
      <Field
        label="Asks"
        hint={template === null ? undefined : "Write {name} where an input's value goes."}
      >
        {(field) => (
          <div className={styles.prompt}>
            <div className={styles.backdrop} aria-hidden="true">
              {highlightParts(text).map((part, index) =>
                part.variable === null ? (
                  <span key={index}>{part.text}</span>
                ) : (
                  <mark
                    key={index}
                    className={styles.variable}
                    data-bound={bound.has(part.variable)}
                  >
                    {part.text}
                  </mark>
                ),
              )}{" "}
            </div>
            <textarea
              id={field}
              className={styles.promptText}
              spellCheck
              value={text}
              onChange={(event) => {
                const prompt = event.target.value;

                change((current) => setPromptText(current, id, prompt), `${id}.prompt`);
              }}
            />
          </div>
        )}
      </Field>
      {variables.length > 0 && (
        <ul className={styles.variables} aria-label="Its variables">
          {variables.map((variable) => {
            const input = bound.get(variable);

            return (
              <li key={variable} className={styles.variableItem} data-bound={input !== undefined}>
                <code>{`{${variable}}`}</code>
                {input === undefined ? (
                  <button
                    type="button"
                    className={styles.bind}
                    onClick={() => {
                      addVariable(variable);
                    }}
                  >
                    + {variable} as an input
                  </button>
                ) : (
                  <span className={styles.quiet}>
                    {input === variable ? "an input" : `the input ${input}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className={styles.field}>
        <span className={styles.label} id={`${id}-answers`}>
          Answers in
        </span>
        <div className={styles.segments} role="group" aria-labelledby={`${id}-answers`}>
          {(["text", "json"] as const).map((format) => (
            <button
              key={format}
              type="button"
              className={styles.segment}
              aria-pressed={json === (format === "json")}
              onClick={() => {
                change((current) => setOutputFormat(current, id, format));
              }}
            >
              {format === "json" ? "JSON" : "Text"}
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** How many of a step's matches it names before it counts the rest. */
const NAMED_MATCHES = 4;

/** How long requirements stay the same before Azathoth is asked which models meet them. */
const MATCHING_DELAY_MS = 250;

/**
 * Which models in the local portfolio a step could choose from as its needs
 * stand, as Azathoth matches them, and how many more the providers serve,
 * with a link to the catalog filtered as near to its needs as it can be.
 */
function Matches({ requirements }: { readonly requirements: JsonObject }) {
  const asked = useDebounced(requirements, MATCHING_DELAY_MS);
  const matched = useMatching(asked);
  const models = useModels();

  if (matched.isError) {
    return (
      <p className={styles.matches} data-none="true">
        Couldn’t ask Azathoth which models meet these needs: {matched.error.message}
      </p>
    );
  }
  if (matched.data === undefined) {
    return null;
  }

  const needs = needsOf(requirements);
  const local = matched.data;
  const elsewhere = (models.data?.items ?? []).filter(
    (model) => !model.authorized && meets(model, needs),
  ).length;
  const query = searchOf(filterFor(needs)).toString();
  const catalog = query === "" ? "/models" : `/models?${query}`;
  const more = local.length - NAMED_MATCHES;

  return (
    <div className={styles.matches} data-none={local.length === 0} aria-live="polite">
      <p className={styles.matchesText}>
        {local.length === 0
          ? "No model in your local portfolio meets these needs, so it can't run here yet."
          : local.length === 1
            ? "1 model in your local portfolio meets these needs:"
            : `${String(local.length)} models in your local portfolio meet these needs:`}
      </p>
      {local.length > 0 && (
        <ul className={styles.matchList}>
          {local.slice(0, NAMED_MATCHES).map((model) => (
            <li key={model.identifier}>
              <Link to={modelPath(model.identifier)}>{nameOf(model)}</Link>
            </li>
          ))}
          {more > 0 && <li className={styles.quiet}>and {more} more</li>}
        </ul>
      )}
      {elsewhere > 0 ? (
        <Link className={styles.catalogLink} to={catalog}>
          {elsewhere === 1
            ? "1 more your providers serve"
            : `${String(elsewhere)} more your providers serve`}
        </Link>
      ) : (
        local.length === 0 && (
          <span className={styles.hint}>Nor does any model your providers serve now.</span>
        )
      )}
    </div>
  );
}

/** Whether the providers serve the model a step always runs on, and the local portfolio holds it. */
function Fixed({ identifier }: { readonly identifier: string }) {
  const models = useModels();

  if (models.data === undefined) {
    return null;
  }

  const model = models.data.items.find((each) => each.identifier === identifier);

  return model === undefined ? (
    <p className={styles.matches} data-none="true">
      Your providers don&apos;t serve it now.
    </p>
  ) : (
    <p className={styles.matches}>
      <Link to={modelPath(model.identifier)}>{nameOf(model)}</Link>
      {model.authorized
        ? " is served now, and in your local portfolio."
        : " is served now. It isn't in your local portfolio, which a step that always runs on one model doesn't choose from."}
    </p>
  );
}

function Model({ editing }: { readonly editing: Editing }) {
  const { id, step, change } = editing;
  const selection = asObject(asObject(step.specification).model_selection);

  if (!isObject(selection.requirements)) {
    const provider = asText(selection.provider);
    const model = asText(selection.model);

    return (
      <Section title="Its model">
        <p className={styles.quiet}>
          {model === null
            ? "It names no model, nor what one needs."
            : `Always ${model}${provider === null ? "" : `, from ${provider}`}.`}
        </p>
        {provider !== null && model !== null && <Fixed identifier={`${provider}/${model}`} />}
      </Section>
    );
  }

  const requirements = selection.requirements;
  const capabilities = asList(requirements.required_capabilities);
  const need = (field: string, value: JsonValue): void => {
    change((current) => setRequirements(current, id, { [field]: value }), `${id}.${field}`);
  };

  return (
    <Section title="Its model needs">
      <Matches requirements={requirements} />
      <fieldset className={styles.checks}>
        <legend className="visually-hidden">Capabilities</legend>
        {CAPABILITIES.map(([capability, label]) => (
          <label key={capability} className={styles.check}>
            <input
              type="checkbox"
              checked={capabilities.includes(capability)}
              onChange={(event) => {
                const { checked } = event.target;

                change((current) =>
                  setRequirements(current, id, {
                    required_capabilities: [
                      ...capabilities.filter((each) => each !== capability),
                      ...(checked ? [capability] : []),
                    ],
                  }),
                );
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <Field label="Context of at least" hint="Tokens; blank for any.">
        {(field) => (
          <NumberInput
            id={field}
            min={0}
            nullable
            placeholder="Any"
            value={numberOf(requirements.minimum_context_window_tokens)}
            onNumber={(value) => {
              need("minimum_context_window_tokens", value);
            }}
          />
        )}
      </Field>
      <div className={styles.pair}>
        <Field label="Input at most">
          {(field) => (
            <NumberInput
              id={field}
              min={0}
              step="any"
              nullable
              placeholder="Any"
              value={numberOf(requirements.maximum_input_usd_per_million_tokens)}
              onNumber={(value) => {
                need("maximum_input_usd_per_million_tokens", value);
              }}
            />
          )}
        </Field>
        <Field label="Output at most">
          {(field) => (
            <NumberInput
              id={field}
              min={0}
              step="any"
              nullable
              placeholder="Any"
              value={numberOf(requirements.maximum_output_usd_per_million_tokens)}
              onNumber={(value) => {
                need("maximum_output_usd_per_million_tokens", value);
              }}
            />
          )}
        </Field>
      </div>
      <span className={styles.hint}>Dollars for a million tokens.</span>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={requirements.require_known_pricing === true}
          onChange={(event) => {
            need("require_known_pricing", event.target.checked);
          }}
        />
        Only models whose prices are known
      </label>
    </Section>
  );
}

// What a tool step runs.

function Tool({ editing }: { readonly editing: Editing }) {
  const { id, step, change } = editing;
  const tools = useList("tools");
  const names = useId();
  const versions = useId();
  const requirement = asObject(asObject(step.specification).requirement);
  const name = asText(requirement.name) ?? "";
  const version = asText(requirement.version);
  const runtime = asText(requirement.runtime);
  const known = tools.data ?? [];
  const knownNames = [...new Set(known.map((tool) => tool.name))];
  const knownVersions = known.filter((tool) => tool.name === name).map((tool) => tool.version);

  const set = (
    next: {
      readonly name?: string;
      readonly version?: string | null;
      readonly runtime?: string | null;
    },
    group: string,
  ): void => {
    change((current) => setTool(current, id, { name, version, runtime, ...next }), group);
  };

  const hint = tools.isError
    ? "Your instance's tools could not be listed."
    : tools.isSuccess && name !== "" && !knownNames.includes(name)
      ? "Your instance has no tool of this name."
      : undefined;

  return (
    <Section title="Runs the tool">
      <Field label="Tool" hint={hint}>
        {(field) => (
          <input
            id={field}
            className={styles.input}
            list={names}
            placeholder="Choose a tool"
            autoComplete="off"
            value={name}
            onChange={(event) => {
              set({ name: event.target.value }, `${id}.tool`);
            }}
          />
        )}
      </Field>
      <datalist id={names}>
        {knownNames.map((each) => (
          <option key={each} value={each} />
        ))}
      </datalist>
      <div className={styles.pair}>
        <Field label="Version">
          {(field) => (
            <input
              id={field}
              className={styles.input}
              list={versions}
              placeholder="Any"
              autoComplete="off"
              value={version ?? ""}
              onChange={(event) => {
                set(
                  { version: event.target.value === "" ? null : event.target.value },
                  `${id}.version`,
                );
              }}
            />
          )}
        </Field>
        <Field label="Runtime">
          {(field) => (
            <input
              id={field}
              className={styles.input}
              placeholder="Any"
              value={runtime ?? ""}
              onChange={(event) => {
                set(
                  { runtime: event.target.value === "" ? null : event.target.value },
                  `${id}.runtime`,
                );
              }}
            />
          )}
        </Field>
      </div>
      <datalist id={versions}>
        {knownVersions.map((each) => (
          <option key={each} value={each} />
        ))}
      </datalist>
    </Section>
  );
}

// What it reads.

function InputRow({
  editing,
  index,
  input,
  choices,
  names,
  variable,
}: {
  readonly editing: Editing;
  readonly index: number;
  readonly input: JsonObject;
  readonly choices: readonly Choice[];
  readonly names: readonly string[];
  readonly variable: string | null;
}) {
  const { id, document, change } = editing;
  const name = asText(input.name) ?? "";
  const source = sourceOf(input.source);
  const nameList = useId();
  const group = `${id}.inputs.${String(index)}`;

  const setSource = (next: Source, part: string | null = null): void => {
    change(
      (current) =>
        setInputSource(
          next.kind === "step" ? reading(current, id, next.step) : current,
          id,
          name,
          next,
        ),
      part === null ? undefined : `${group}.${part}`,
    );
  };

  const fresh = (kind: Source["kind"]): Source | null => {
    switch (kind) {
      case "input":
        return WORKFLOW_INPUT;
      case "step": {
        const choice = choices.find((each) => each.name === name) ?? choices[0];

        return choice === undefined ? null : { kind: "step", step: choice.step, name: choice.name };
      }
      case "context":
        return { kind: "context", name: names.includes(name) ? name : (names[0] ?? name) };
      case "constant":
        return { kind: "constant", value: "" };
    }
  };

  return (
    <li className={styles.row}>
      <div className={styles.rowTop}>
        <input
          className={styles.name}
          aria-label="Input name"
          value={name}
          onChange={(event) => {
            const to = event.target.value;

            change((current) => renameInput(current, id, name, to), `${group}.name`);
          }}
        />
        {variable !== null && <code className={styles.tag}>{`{${variable}}`}</code>}
        <RemoveButton
          label={`Remove the input ${name}`}
          onRemove={() => {
            change((current) => removeInput(current, id, name));
          }}
        />
      </div>
      <select
        className={styles.select}
        aria-label={`Where ${name} comes from`}
        value={source?.kind ?? ""}
        onChange={(event) => {
          const kind = SOURCE_KINDS.find(([each]) => each === event.target.value)?.[0];
          const next = kind === undefined ? null : fresh(kind);

          if (next !== null) {
            setSource(next);
          }
        }}
      >
        {source === null && (
          <option value="" disabled>
            Somewhere the editor does not know
          </option>
        )}
        {SOURCE_KINDS.map(([kind, label]) => (
          <option key={kind} value={kind} disabled={kind === "step" && choices.length === 0}>
            {label}
          </option>
        ))}
      </select>
      {source?.kind === "input" && (
        <DraftInput
          aria-label={`The input field ${name} reads`}
          placeholder="input"
          value={source.field}
          commit={(text) => {
            setSource({ kind: "input", field: text }, "field");
            return text;
          }}
        />
      )}
      {source?.kind === "step" && (
        <ChoiceSelect
          label={`The output ${name} reads`}
          current={source}
          choices={choices}
          document={document}
          onChoose={(choice) => {
            setSource({ kind: "step", step: choice.step, name: choice.name });
          }}
        />
      )}
      {source?.kind === "context" && (
        <>
          <DraftInput
            aria-label={`The name ${name} reads`}
            list={nameList}
            autoComplete="off"
            value={source.name}
            commit={(text) => {
              setSource({ kind: "context", name: text }, "context");
              return text;
            }}
          />
          <datalist id={nameList}>
            {names.map((each) => (
              <option key={each} value={each} />
            ))}
          </datalist>
        </>
      )}
      {source?.kind === "constant" && (
        <div className={styles.constant}>
          <DraftInput
            aria-label={`The value of ${name}`}
            placeholder="Text, or JSON"
            value={formatConstant(source.value)}
            commit={(text) => {
              const value = parseConstant(text);

              setSource({ kind: "constant", value }, "constant");
              return formatConstant(value);
            }}
          />
          <span className={styles.hint}>{kindOfConstant(source.value)}</span>
        </div>
      )}
    </li>
  );
}

function Inputs({
  editing,
  choices,
}: {
  readonly editing: Editing;
  readonly choices: readonly Choice[];
}) {
  const { id, step, document, change } = editing;
  const inputs = asList(step.inputs).filter(isObject);
  const names = namesFromDependencies(document, id);
  const bindings = asList(asObject(asObject(step.specification).template).bindings).filter(
    isObject,
  );

  return (
    <Section title="Takes">
      {inputs.length === 0 ? (
        <p className={styles.quiet}>It takes nothing.</p>
      ) : (
        <ul className={styles.rows}>
          {inputs.map((input, index) => {
            const name = asText(input.name);
            const binding = bindings.find((each) => asText(each.input_name) === name);

            return (
              <InputRow
                key={index}
                editing={editing}
                index={index}
                input={input}
                choices={choices}
                names={names}
                variable={binding === undefined ? null : asText(binding.variable_name)}
              />
            );
          })}
        </ul>
      )}
      <AddButton
        onAdd={() => {
          change((current) => addInput(current, id, "input", WORKFLOW_INPUT));
        }}
      >
        + Input
      </AddButton>
    </Section>
  );
}

// What it writes.

function firstProducer(document: JsonObject, name: string): string | null {
  const producer = stepsOf(document).find((step) =>
    asList(step.outputs).some((output) => asText(asObject(output).name) === name),
  );

  return producer === undefined ? null : idOf(producer);
}

function Outputs({ editing }: { readonly editing: Editing }) {
  const { id, step, document, change } = editing;
  const outputs = asList(step.outputs).filter(isObject);
  const result = asObject(document.result);
  const resultName = asText(result.name);
  const resultStep =
    asText(result.producer_step_id) ??
    (resultName === null ? null : firstProducer(document, resultName));

  return (
    <Section title="Writes">
      {outputs.length === 0 ? (
        <p className={styles.quiet}>It writes nothing.</p>
      ) : (
        <ul className={styles.rows}>
          {outputs.map((output, index) => {
            const name = asText(output.name) ?? "";
            const group = `${id}.outputs.${String(index)}`;
            const isResult = resultStep === id && resultName === name;

            return (
              <li key={index} className={styles.row}>
                <div className={styles.rowTop}>
                  <input
                    className={styles.name}
                    aria-label="Output name"
                    value={name}
                    onChange={(event) => {
                      const to = event.target.value;

                      change((current) => renameOutput(current, id, name, to), `${group}.name`);
                    }}
                  />
                  <RemoveButton
                    label={`Remove the output ${name}`}
                    onRemove={() => {
                      change((current) => removeOutput(current, id, name));
                    }}
                  />
                </div>
                <DraftInput
                  aria-label={`Where ${name} is in the reply`}
                  placeholder="The whole reply"
                  value={formatPath(output.path)}
                  commit={(text) => {
                    const path = parsePath(text);

                    change((current) => setOutputPath(current, id, name, path), `${group}.path`);
                    return formatPath(path);
                  }}
                />
                {isResult ? (
                  <span className={styles.result}>The workflow&apos;s result</span>
                ) : (
                  <button
                    type="button"
                    className={styles.makeResult}
                    onClick={() => {
                      change((current) => setResult(current, { step: id, name }));
                    }}
                  >
                    Make {name} the result
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AddButton
        onAdd={() => {
          change((current) => addOutput(current, id, "output"));
        }}
      >
        + Output
      </AddButton>
    </Section>
  );
}

// When it runs.

function Conditions({
  editing,
  choices,
}: {
  readonly editing: Editing;
  readonly choices: readonly Choice[];
}) {
  const { id, step, document, change } = editing;
  const conditions = asList(step.conditions).filter(isObject);
  const first = choices[0];

  return (
    <Section title="Runs only when">
      {conditions.length === 0 ? (
        <p className={styles.quiet}>It always runs.</p>
      ) : (
        <ul className={styles.rows}>
          {conditions.map((condition, index) => {
            const source = asObject(condition.source);
            const from = asText(source.producer_step_id);
            const name = asText(source.name) ?? "";
            const operator = asText(condition.operator);
            const expected = condition.expected ?? null;

            return (
              <li key={index} className={styles.row}>
                <div className={styles.rowTop}>
                  <ChoiceSelect
                    label="The output it tests"
                    current={from === null ? null : { step: from, name }}
                    choices={choices}
                    document={document}
                    onChoose={(choice) => {
                      change((current) =>
                        setCondition(reading(current, id, choice.step), id, index, {
                          source: { step: choice.step, name: choice.name },
                        }),
                      );
                    }}
                  />
                  <RemoveButton
                    label={`Remove the condition on ${name}`}
                    onRemove={() => {
                      change((current) => removeCondition(current, id, index));
                    }}
                  />
                </div>
                <div className={styles.test}>
                  <select
                    className={styles.select}
                    aria-label="The test"
                    value={operator ?? ""}
                    onChange={(event) => {
                      const next = OPERATORS.find(([each]) => each === event.target.value)?.[0];

                      if (next !== undefined) {
                        change((current) => setCondition(current, id, index, { operator: next }));
                      }
                    }}
                  >
                    {OPERATORS.map(([each, label]) => (
                      <option key={each} value={each}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <DraftInput
                    aria-label="The value it is tested against"
                    value={formatConstant(expected)}
                    commit={(text) => {
                      const value = parseConstant(text);

                      change(
                        (current) => setCondition(current, id, index, { expected: value }),
                        `${id}.conditions.${String(index)}.expected`,
                      );
                      return formatConstant(value);
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AddButton
        disabled={first === undefined}
        title={first === undefined ? "No step it could run after writes anything yet." : undefined}
        onAdd={() => {
          if (first !== undefined) {
            change((current) =>
              addCondition(reading(current, id, first.step), id, {
                step: first.step,
                name: first.name,
              }),
            );
          }
        }}
      >
        + Condition
      </AddButton>
    </Section>
  );
}

// What it does when it fails.

function Failing({ editing }: { readonly editing: Editing }) {
  const { id, step, change } = editing;
  const retry = asObject(step.retry_policy);
  const attempts = numberOf(retry.max_attempts);
  const retries = (field: string, value: number | null): void => {
    change((current) => setRetry(current, id, { [field]: value }), `${id}.${field}`);
  };

  return (
    <Section title="If it fails">
      <Field label="Tries">
        {(field) => (
          <NumberInput
            id={field}
            min={1}
            step={1}
            value={attempts}
            onNumber={(value) => {
              retries("max_attempts", value);
            }}
          />
        )}
      </Field>
      {attempts !== null && attempts > 1 && (
        <div className={styles.triple}>
          <Field label="First wait">
            {(field) => (
              <NumberInput
                id={field}
                min={0}
                step="any"
                value={numberOf(retry.initial_delay_seconds)}
                onNumber={(value) => {
                  retries("initial_delay_seconds", value);
                }}
              />
            )}
          </Field>
          <Field label="Then ×">
            {(field) => (
              <NumberInput
                id={field}
                min={1}
                step="any"
                value={numberOf(retry.backoff_multiplier)}
                onNumber={(value) => {
                  retries("backoff_multiplier", value);
                }}
              />
            )}
          </Field>
          <Field label="At most">
            {(field) => (
              <NumberInput
                id={field}
                min={0}
                step="any"
                nullable
                placeholder="No limit"
                value={numberOf(retry.maximum_delay_seconds)}
                onNumber={(value) => {
                  retries("maximum_delay_seconds", value);
                }}
              />
            )}
          </Field>
        </div>
      )}
      {attempts !== null && attempts > 1 && (
        <span className={styles.hint}>Seconds between tries, each wait the last times ×.</span>
      )}
      <Field label="Once it has failed">
        {(field) => (
          <select
            id={field}
            className={styles.select}
            value={asText(step.failure_policy) ?? "fail_workflow"}
            onChange={(event) => {
              const policy = FAILURE_POLICIES.find(([each]) => each === event.target.value)?.[0];

              if (policy !== undefined) {
                change((current) => setFailurePolicy(current, id, policy));
              }
            }}
          >
            {FAILURE_POLICIES.map(([policy, label]) => (
              <option key={policy} value={policy}>
                {label}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Section>
  );
}

/**
 * A step's details as a form, for composing: what it is and says, what it
 * asks of a model or which tool it runs, what it takes and from where, what
 * it writes, when it runs and what it does when it fails. Every change is
 * one edit of the document, so undo takes it back.
 */
export function StepForm({
  composing,
  id,
}: {
  readonly composing: Composing;
  readonly id: string;
}) {
  const { document, problems } = composing;
  const step = stepsOf(document).find((each) => idOf(each) === id);

  if (step === undefined) {
    return null;
  }

  const specification = asObject(step.specification);
  const prompt = isObject(specification.metadata);
  const tool = isObject(specification.requirement);
  const choices = sourceChoices(document, id);
  const found = problems.get(id) ?? [];
  const editing: Editing = {
    id,
    step,
    document,
    change: (edit, group) => {
      composing.change(edit, group);
    },
  };

  return (
    <div className={styles.form}>
      {found.length > 0 && (
        <ul className={styles.problems} aria-label="What to fix">
          {found.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <About editing={editing} prompt={prompt} />
      {prompt && <Prompt editing={editing} choices={choices} />}
      {prompt && <Model editing={editing} />}
      {tool && <Tool editing={editing} />}
      <Inputs editing={editing} choices={choices} />
      <Outputs editing={editing} />
      <Conditions editing={editing} choices={choices} />
      <Failing editing={editing} />
      <details className={styles.advanced}>
        <summary>Advanced</summary>
        <dl className={styles.ids}>
          <dt>Step id</dt>
          <dd>
            <code>{id}</code>
          </dd>
          {prompt && (
            <>
              <dt>Prompt id</dt>
              <dd>
                <code>{asText(asObject(specification.metadata).id) ?? "none"}</code>
              </dd>
            </>
          )}
        </dl>
        <JsonEditor
          label="This step as JSON"
          value={step}
          rows={14}
          onChange={(value) => {
            composing.change((current) => replaceStep(current, id, value), `${id}.json`);
          }}
        />
        <p className={styles.hint}>
          What the form leaves out is here: its message&apos;s values, its confidence, and what its
          model reads and writes. Its ids stay as the editor made them.
        </p>
      </details>
    </div>
  );
}

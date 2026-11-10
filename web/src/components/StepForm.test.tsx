import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  addOutput,
  addStep,
  asList,
  asObject,
  setStepName,
  stepsOf,
  type JsonObject,
} from "../editing";
import type { Problem } from "../problems";
import { uuid, VALID_DOCUMENT } from "../test/documents";
import { answering, LARGE_MODEL, SERVER, serving, urlOf } from "../test/instances";
import { renderAt } from "../test/render";
import { problemsByStep, type Composing } from "./composing";
import { StepForm } from "./StepForm";

const SELECT = uuid(11);
const SUMMARIZE = uuid(12);

/**
 * A server that answers as the fake one does, and matches the local
 * portfolio's one model, the large one, to requirements that ask for no
 * capability, as Azathoth would.
 */
const matching: typeof fetch = (input, init) => {
  if (urlOf(input).pathname !== "/api/models/matching") {
    return serving(SERVER)(input, init);
  }

  const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
    readonly requirements?: { readonly required_capabilities?: readonly string[] };
  };
  const asked = body.requirements?.required_capabilities ?? [];

  return answering(200, { items: asked.length === 0 ? [LARGE_MODEL] : [] })(input, init);
};

/** Opens one step's form on a document the form changes, recording each change's group. */
function open(
  id: string,
  start: JsonObject = VALID_DOCUMENT,
  found: readonly Problem[] = [],
  fetcher: typeof fetch = matching,
) {
  let latest = start;
  const groups: (string | null)[] = [];

  function Harness() {
    const [document, setDocument] = useState(start);
    const composing: Composing = {
      problems: problemsByStep(found),
      change: (edit, group) => {
        groups.push(group ?? null);
        setDocument((current) => edit(current));
      },
      newId: () => uuid(99),
      document,
    };

    latest = document;
    return <StepForm composing={composing} id={id} />;
  }

  renderAt(<Harness />, { fetcher });

  const step = (at = id): JsonObject => stepsOf(latest).find((each) => each.id === at) ?? {};

  return { document: () => latest, step, groups };
}

/** Returns the document with the prompt step always running on one model. */
function fixedTo(provider: string, model: string): JsonObject {
  return {
    ...VALID_DOCUMENT,
    steps: stepsOf(VALID_DOCUMENT).map((each) =>
      each.id === SUMMARIZE
        ? {
            ...each,
            specification: {
              ...asObject(each.specification),
              model_selection: { provider, model },
            },
          }
        : each,
    ),
  };
}

function textbox(name: string): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", { name });
}

function choice(name: string): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name });
}

function type(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
}

describe("StepForm for a prompt step", () => {
  it("names and describes the step, and what it says as it runs, each field undone as one", () => {
    const { step, groups } = open(SUMMARIZE);

    type(textbox("Its name"), "Summarize it");
    type(textbox("Its name"), "Summarize it all");
    type(textbox("What it does"), "In one line.");
    type(textbox("Says as it runs"), "");

    expect(step()).toMatchObject({
      specification: { metadata: { name: "Summarize it all", description: "In one line." } },
    });
    expect(step()).not.toHaveProperty("message");
    expect(groups).toEqual([
      `${SUMMARIZE}.name`,
      `${SUMMARIZE}.name`,
      `${SUMMARIZE}.description`,
      `${SUMMARIZE}.message`,
    ]);
  });

  it("lights the prompt's variables, and binds one to a new input", () => {
    const { step } = open(SUMMARIZE);

    type(textbox("Asks"), "Summarize {ticket} for {reader}.");

    const variables = screen.getByRole("list", { name: "Its variables" });

    expect(within(variables).getByText("an input")).toBeInTheDocument();
    expect(document.querySelector('mark[data-bound="true"]')).toHaveTextContent("{ticket}");
    expect(document.querySelector('mark[data-bound="false"]')).toHaveTextContent("{reader}");

    fireEvent.click(within(variables).getByRole("button", { name: "+ reader as an input" }));

    expect(step()).toMatchObject({
      inputs: [
        { name: "ticket" },
        {
          name: "reader",
          source: { event_type: "workflow.input.received", field_name: "input" },
        },
      ],
      specification: {
        template: {
          bindings: [
            { variable_name: "ticket", input_name: "ticket" },
            { variable_name: "reader", input_name: "reader" },
          ],
        },
      },
    });
    expect(document.querySelector('mark[data-bound="false"]')).toBeNull();
  });

  it("reads a new input from a step's output of the variable's name, when one writes it", () => {
    const { step } = open(SUMMARIZE);

    type(textbox("Asks"), "{ticket} is {length} long.");
    fireEvent.click(screen.getByRole("button", { name: "+ length as an input" }));

    expect(step().inputs).toContainEqual({
      name: "length",
      source: { producer_step_id: SELECT, name: "length" },
    });
  });

  it("answers in text or in JSON", () => {
    const { step } = open(SUMMARIZE);
    const json = screen.getByRole("button", { name: "JSON" });

    expect(screen.getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(json);

    expect(step()).toMatchObject({ specification: { output_format: "json" } });
    expect(json).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    expect(asObject(step().specification)).not.toHaveProperty("output_format");
  });

  it("changes what its model needs", () => {
    const { step } = open(SUMMARIZE);
    const context = screen.getByRole("spinbutton", { name: "Context of at least" });

    fireEvent.click(screen.getByRole("checkbox", { name: "Vision" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Tool use" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Vision" }));
    type(context, "128000");
    type(screen.getByRole("spinbutton", { name: "Output at most" }), "2.5");
    fireEvent.click(screen.getByRole("checkbox", { name: "Only models whose prices are known" }));

    expect(step()).toMatchObject({
      specification: {
        model_selection: {
          requirements: {
            required_capabilities: ["tool_use"],
            minimum_context_window_tokens: 128000,
            maximum_output_usd_per_million_tokens: 2.5,
            require_known_pricing: true,
          },
        },
      },
    });

    type(context, "");

    expect(step()).toMatchObject({
      specification: { model_selection: { requirements: { minimum_context_window_tokens: null } } },
    });
  });

  it("says which model a step always runs on", () => {
    open(SUMMARIZE, fixedTo("openrouter", "acme/large"));

    expect(screen.getByText("Always acme/large, from openrouter.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Vision" })).toBeNull();
  });

  it("names the models of the local portfolio that meet its needs, and counts the rest", async () => {
    open(SUMMARIZE);

    expect(
      await screen.findByText("1 model in your local portfolio meets these needs:"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Acme Large" })).toHaveAttribute(
      "href",
      "/models/openrouter/acme/large",
    );
    expect(screen.getByRole("link", { name: "2 more your providers serve" })).toHaveAttribute(
      "href",
      "/models",
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Streaming" }));

    expect(
      await screen.findByText(
        "No model in your local portfolio meets these needs, so it can't run here yet.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1 more your providers serve" })).toHaveAttribute(
      "href",
      "/models?can=streaming",
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Vision" }));

    expect(
      await screen.findByText("Nor does any model your providers serve now."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /more your providers serve/ })).toBeNull();
  });

  it("says whether the one model a step always runs on is served, and held locally", async () => {
    open(SUMMARIZE, fixedTo("openrouter", "acme/small:free"));

    expect(await screen.findByRole("link", { name: "Acme Small (free)" })).toHaveAttribute(
      "href",
      "/models/openrouter/acme/small%3Afree",
    );
    expect(
      screen.getByText(/is served now\. It isn't in your local portfolio/),
    ).toBeInTheDocument();
  });

  it("says when the one model a step always runs on is not served", async () => {
    open(SUMMARIZE, fixedTo("openrouter", "acme/gone"));

    expect(await screen.findByText("Your providers don't serve it now.")).toBeInTheDocument();
  });

  it("lists what is wrong with the step", () => {
    open(SUMMARIZE, VALID_DOCUMENT, [
      { step: SUMMARIZE, message: "Prompt › text can’t be empty." },
      { step: SELECT, message: "Not this step's." },
    ]);

    expect(screen.getByRole("list", { name: "What to fix" })).toHaveTextContent(
      "Prompt › text can’t be empty.",
    );
    expect(screen.getByRole("list", { name: "What to fix" })).not.toHaveTextContent(
      "Not this step's.",
    );
  });

  it("edits the step as JSON under Advanced, keeping its id", () => {
    const { step, groups } = open(SUMMARIZE);
    const json = screen.getByLabelText<HTMLTextAreaElement>("This step as JSON");
    const written = JSON.parse(json.value) as JsonObject;

    expect(written).toEqual(step());

    type(json, JSON.stringify({ ...written, id: uuid(98), confidence: "summary" }));

    expect(step()).toMatchObject({ id: SUMMARIZE, confidence: "summary" });
    expect(groups).toEqual([`${SUMMARIZE}.json`]);
  });

  it("shows its ids under Advanced", () => {
    open(SUMMARIZE);

    expect(screen.getByText(SUMMARIZE)).toBeInTheDocument();
    expect(screen.getByText(uuid(22))).toBeInTheDocument();
  });
});

describe("StepForm for a tool step", () => {
  it("chooses the tool from the instance's tools, and says when it has none of the name", async () => {
    const { step } = open(SELECT);

    expect(screen.getByRole("combobox", { name: "Tool" })).toHaveValue("json_select");
    expect(await screen.findByText("Your instance has no tool of this name.")).toBeInTheDocument();
    expect(document.querySelector("datalist option[value='count_words']")).not.toBeNull();

    type(screen.getByRole("combobox", { name: "Tool" }), "count_words");
    type(screen.getByRole("combobox", { name: "Version" }), "");

    expect(step()).toMatchObject({
      specification: { requirement: { name: "count_words", version: null, runtime: "process" } },
    });
    expect(screen.queryByText("Your instance has no tool of this name.")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Its name" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Asks" })).toBeNull();
  });
});

describe("StepForm's inputs", () => {
  it("renames an input, and the prompt's binding with it", () => {
    const { step } = open(SUMMARIZE);

    type(textbox("Input name"), "tickets");

    expect(step()).toMatchObject({
      inputs: [{ name: "tickets", source: { producer_step_id: SELECT, name: "text" } }],
      specification: {
        template: { bindings: [{ variable_name: "ticket", input_name: "tickets" }] },
      },
    });
  });

  it("reads an input from wherever it is chosen to come from", () => {
    const { step } = open(SUMMARIZE);
    const source = (): JsonObject => asObject(asList(step().inputs)[0]);

    expect(choice("Where ticket comes from")).toHaveValue("step");
    expect(choice("The output ticket reads")).toHaveValue(`${SELECT}\ntext`);

    fireEvent.change(choice("The output ticket reads"), { target: { value: `${SELECT}\nlength` } });
    expect(source().source).toEqual({ producer_step_id: SELECT, name: "length" });

    fireEvent.change(choice("Where ticket comes from"), { target: { value: "input" } });
    expect(source().source).toEqual({
      event_type: "workflow.input.received",
      field_name: "input",
    });

    fireEvent.change(choice("Where ticket comes from"), { target: { value: "context" } });
    expect(source().source).toEqual({ name: "text" });

    fireEvent.change(choice("Where ticket comes from"), { target: { value: "constant" } });
    expect(source().source).toEqual({ value: "" });

    type(textbox("The value of ticket"), '["a"]');
    expect(source().source).toEqual({ value: ["a"] });
    expect(screen.getByText("a list")).toBeInTheDocument();
  });

  it("keeps a constant as it is typed, and shows it as it reads once left", () => {
    const { step } = open(SUMMARIZE);

    fireEvent.change(choice("Where ticket comes from"), { target: { value: "constant" } });

    const field = textbox("The value of ticket");

    type(field, '"quoted"');

    expect(step().inputs).toEqual([{ name: "ticket", source: { value: "quoted" } }]);
    expect(field).toHaveValue('"quoted"');

    fireEvent.blur(field);

    expect(field).toHaveValue("quoted");
  });

  it("runs the step after one it is to read from, when it does not yet", () => {
    const other = uuid(13);
    const start = addOutput(
      setStepName(addStep(VALID_DOCUMENT, "prompt", { step: other }), other, "Other"),
      other,
      "note",
    );
    const { step } = open(SUMMARIZE, start);

    expect(
      within(choice("The output ticket reads")).getByRole("option", {
        name: "Other · note (runs it after)",
      }),
    ).toBeInTheDocument();

    fireEvent.change(choice("The output ticket reads"), { target: { value: `${other}\nnote` } });

    expect(step()).toMatchObject({
      depends_on: [SELECT, other],
      inputs: [{ name: "ticket", source: { producer_step_id: other, name: "note" } }],
    });
  });

  it("adds an input that reads the workflow's input, and removes one", () => {
    const { step } = open(SUMMARIZE);

    fireEvent.click(screen.getByRole("button", { name: "Remove the input ticket" }));

    expect(step()).toMatchObject({ inputs: [], specification: { template: { bindings: [] } } });
    expect(screen.getByText("It takes nothing.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ Input" }));

    expect(step()).toMatchObject({
      inputs: [
        { name: "input", source: { event_type: "workflow.input.received", field_name: "input" } },
      ],
    });
  });
});

describe("StepForm's outputs", () => {
  it("renames an output, finds it at a path, and makes it the result", () => {
    const { step, document: current } = open(SELECT);
    const path = textbox("Where text is in the reply");

    expect(path).toHaveValue("value");

    type(path, "choices.0.");

    expect(path).toHaveValue("choices.0.");
    expect(asList(step().outputs)[0]).toEqual({ name: "text", path: ["choices", 0, ""] });

    fireEvent.click(screen.getByRole("button", { name: "Make text the result" }));

    expect(current().result).toEqual({ producer_step_id: SELECT, name: "text" });
    expect(screen.getByText("The workflow's result")).toBeInTheDocument();

    type(screen.getByDisplayValue("text"), "body");

    expect(current().result).toEqual({ producer_step_id: SELECT, name: "body" });
  });

  it("adds an output, and removes one", () => {
    const { step } = open(SUMMARIZE);

    expect(screen.getByText("The workflow's result")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ Output" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove the output summary" }));

    expect(step()).toMatchObject({ outputs: [{ name: "output", path: [] }] });
  });
});

describe("StepForm's conditions", () => {
  it("changes what a condition tests, and how", () => {
    const { step } = open(SUMMARIZE);

    expect(choice("The output it tests")).toHaveValue(`${SELECT}\nlength`);
    expect(choice("The test")).toHaveValue("greater_than");

    fireEvent.change(choice("The test"), { target: { value: "less_than_or_equal" } });
    type(textbox("The value it is tested against"), "5");
    fireEvent.change(choice("The output it tests"), { target: { value: `${SELECT}\ntext` } });

    expect(step()).toMatchObject({
      conditions: [
        {
          source: { producer_step_id: SELECT, name: "text" },
          operator: "less_than_or_equal",
          expected: 5,
        },
      ],
    });
  });

  it("adds a condition on the first output it can read, and removes one", () => {
    const { step } = open(SUMMARIZE);

    fireEvent.click(screen.getByRole("button", { name: "Remove the condition on length" }));

    expect(screen.getByText("It always runs.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ Condition" }));

    expect(step()).toMatchObject({
      conditions: [
        { source: { producer_step_id: SELECT, name: "text" }, operator: "equal", expected: true },
      ],
    });
  });

  it("offers no condition when no step it could run after writes anything", () => {
    open(SELECT);

    expect(screen.getByRole("button", { name: "+ Condition" })).toBeDisabled();
  });
});

describe("StepForm's failing", () => {
  it("changes how often it tries, how long it waits, and what then", () => {
    const { step } = open(SUMMARIZE);

    type(screen.getByRole("spinbutton", { name: "Tries" }), "3");
    type(screen.getByRole("spinbutton", { name: "First wait" }), "0.5");
    type(screen.getByRole("spinbutton", { name: "At most" }), "");
    fireEvent.change(choice("Once it has failed"), { target: { value: "skip_dependents" } });

    expect(step()).toMatchObject({
      retry_policy: {
        max_attempts: 3,
        initial_delay_seconds: 0.5,
        backoff_multiplier: 2,
        maximum_delay_seconds: null,
      },
      failure_policy: "skip_dependents",
    });
  });

  it("keeps the tries when they are cleared, and asks nothing of waits for one try", () => {
    const { step } = open(SELECT);
    const tries = screen.getByRole("spinbutton", { name: "Tries" });

    expect(screen.queryByRole("spinbutton", { name: "First wait" })).toBeNull();

    type(tries, "");

    expect(step()).toMatchObject({ retry_policy: { max_attempts: 1 } });
  });
});

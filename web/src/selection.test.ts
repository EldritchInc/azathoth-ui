import { describe, expect, it } from "vitest";

import type { ModelSummary } from "./api/types";
import { asObject, setRequirements, stepsOf, type JsonObject } from "./editing";
import { NO_FILTER } from "./models";
import { filterFor, meets, needsOf, selectionOf, stepsThatCouldUse, type Needs } from "./selection";
import { uuid, VALID_DOCUMENT } from "./test/documents";
import { BEDROCK_MODEL, LARGE_MODEL, SMALL_MODEL } from "./test/instances";

const SUMMARIZE = uuid(12);

const ANY: Needs = needsOf({});

function needing(change: Partial<Needs>): Needs {
  return { ...ANY, ...change };
}

function fixedTo(identifier: string): JsonObject {
  const [provider = "", ...rest] = identifier.split("/");

  return {
    ...VALID_DOCUMENT,
    steps: stepsOf(VALID_DOCUMENT).map((step) =>
      step.id === SUMMARIZE
        ? {
            ...step,
            specification: {
              ...asObject(step.specification),
              model_selection: { provider, model: rest.join("/") },
            },
          }
        : step,
    ),
  };
}

describe("needsOf", () => {
  it("reads a step's requirements, text in and out unless it says otherwise", () => {
    expect(ANY).toEqual({
      capabilities: [],
      reads: ["text"],
      writes: ["text"],
      context: null,
      output: null,
      inputPrice: null,
      outputPrice: null,
      knownPricing: false,
    });
    expect(
      needsOf({
        required_capabilities: ["vision"],
        required_input_modalities: ["image"],
        required_output_modalities: [],
        minimum_context_window_tokens: 128000,
        minimum_output_tokens: 4096,
        maximum_input_usd_per_million_tokens: 3,
        maximum_output_usd_per_million_tokens: null,
        require_known_pricing: true,
      }),
    ).toEqual({
      capabilities: ["vision"],
      reads: ["image"],
      writes: [],
      context: 128000,
      output: 4096,
      inputPrice: 3,
      outputPrice: null,
      knownPricing: true,
    });
  });
});

describe("selectionOf", () => {
  it("says a step chooses by what it needs, or always runs on one model", () => {
    const [select, summarize] = stepsOf(VALID_DOCUMENT);
    const fixed = stepsOf(fixedTo("openrouter/acme/small:free"))[1];

    expect(selectionOf(summarize ?? {})).toEqual({ kind: "needs", needs: ANY });
    expect(selectionOf(fixed ?? {})).toEqual({
      kind: "fixed",
      identifier: "openrouter/acme/small:free",
    });
    expect(selectionOf(select ?? {})).toBeNull();
    expect(
      selectionOf({ specification: { model_selection: { provider: "openrouter", model: "" } } }),
    ).toBeNull();
  });
});

describe("meets", () => {
  it("asks for every capability, and what it reads and writes", () => {
    expect(meets(LARGE_MODEL, ANY)).toBe(true);
    expect(meets(LARGE_MODEL, needing({ capabilities: ["vision", "tool_use"] }))).toBe(true);
    expect(meets(SMALL_MODEL, needing({ capabilities: ["vision"] }))).toBe(false);
    expect(meets(LARGE_MODEL, needing({ reads: ["image"] }))).toBe(true);
    expect(meets(SMALL_MODEL, needing({ reads: ["text", "image"] }))).toBe(false);
    expect(meets(LARGE_MODEL, needing({ writes: ["image"] }))).toBe(false);
  });

  it("asks for at least the context and output, refusing what is unknown", () => {
    expect(meets(LARGE_MODEL, needing({ context: 200_000 }))).toBe(true);
    expect(meets(LARGE_MODEL, needing({ context: 200_001 }))).toBe(false);
    expect(meets(BEDROCK_MODEL, needing({ context: 1 }))).toBe(false);
    expect(meets(LARGE_MODEL, needing({ output: 32_000 }))).toBe(true);
    expect(meets(LARGE_MODEL, needing({ output: 32_001 }))).toBe(false);
    expect(meets(SMALL_MODEL, needing({ output: 1 }))).toBe(false);
  });

  it("asks for at most the prices, refusing unknown prices once any is asked", () => {
    expect(meets(LARGE_MODEL, needing({ inputPrice: 3 }))).toBe(true);
    expect(meets(LARGE_MODEL, needing({ inputPrice: 2.99 }))).toBe(false);
    expect(meets(LARGE_MODEL, needing({ outputPrice: 14.99 }))).toBe(false);
    expect(meets(SMALL_MODEL, needing({ outputPrice: 0 }))).toBe(true);
    expect(meets(BEDROCK_MODEL, needing({ outputPrice: 100 }))).toBe(false);
    expect(meets(BEDROCK_MODEL, needing({ knownPricing: true }))).toBe(false);
    expect(meets(SMALL_MODEL, needing({ knownPricing: true }))).toBe(true);
    expect(meets(BEDROCK_MODEL, ANY)).toBe(true);
  });

  it("counts a model with only one price known as unpriced", () => {
    const half: ModelSummary = { ...LARGE_MODEL, output_usd_per_million_tokens: null };

    expect(meets(half, needing({ inputPrice: 100 }))).toBe(false);
    expect(meets(half, needing({ knownPricing: true }))).toBe(false);
    expect(meets(half, ANY)).toBe(true);
  });
});

describe("stepsThatCouldUse", () => {
  const workflow = { id: uuid(1), name: "summarize ticket", document: VALID_DOCUMENT };

  it("finds the steps whose needs a model meets", () => {
    expect(stepsThatCouldUse(SMALL_MODEL, [workflow])).toEqual([
      {
        workflowId: uuid(1),
        workflowName: "summarize ticket",
        stepId: SUMMARIZE,
        step: "Summarize",
        fixed: false,
      },
    ]);
  });

  it("leaves out a step whose needs it does not meet", () => {
    const document = setRequirements(VALID_DOCUMENT, SUMMARIZE, {
      required_capabilities: ["vision"],
    });

    expect(stepsThatCouldUse(SMALL_MODEL, [{ ...workflow, document }])).toEqual([]);
    expect(stepsThatCouldUse(LARGE_MODEL, [{ ...workflow, document }])).toHaveLength(1);
  });

  it("finds a step that always runs on the model, and no other model", () => {
    const document = fixedTo(SMALL_MODEL.identifier);

    expect(stepsThatCouldUse(SMALL_MODEL, [{ ...workflow, document }])).toMatchObject([
      { stepId: SUMMARIZE, fixed: true },
    ]);
    expect(stepsThatCouldUse(LARGE_MODEL, [{ ...workflow, document }])).toEqual([]);
  });
});

describe("filterFor", () => {
  it("asks the catalog for what it can of the needs", () => {
    expect(filterFor(ANY)).toEqual(NO_FILTER);
    expect(
      filterFor(
        needing({
          reads: ["text", "image", "embeddings"],
          capabilities: ["vision", "json_mode"],
          context: 128_000,
          inputPrice: 3,
          outputPrice: 15,
          output: 4096,
          knownPricing: true,
        }),
      ),
    ).toEqual({
      ...NO_FILTER,
      reads: ["image"],
      can: ["vision"],
      context: 128_000,
      inputPrice: 3,
      outputPrice: 15,
    });
  });
});

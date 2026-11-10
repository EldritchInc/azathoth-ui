import { describe, expect, it } from "vitest";

import type { DocumentProblem } from "./api/types";
import { stepsOf } from "./editing";
import { fieldName, problemsOf, titleOf, worded } from "./problems";
import { uuid, VALID_DOCUMENT } from "./test/documents";

const DOCUMENT = VALID_DOCUMENT;
const PICK = uuid(11);
const SUMMARIZE = uuid(12);

function problem(
  message: string,
  location: readonly (string | number)[],
  step: string | null = null,
): DocumentProblem {
  return { message, location, step_id: step };
}

describe("fieldName", () => {
  it("names a step's field without the step, as the step is named beside it", () => {
    expect(fieldName(["steps", 1, "specification", "model_selection"], DOCUMENT)).toBe(
      "model selection",
    );
    expect(fieldName(["steps", 0, "specification", "requirement", "name"], DOCUMENT)).toBe(
      "tool › name",
    );
    expect(
      fieldName(["steps", 1, "specification", "model_selection", "requirements"], DOCUMENT),
    ).toBe("model selection › model needs");
    expect(fieldName(["steps", 0], DOCUMENT)).toBe("");
  });

  it("names an input or an output by its name, or by its place when it has none", () => {
    expect(fieldName(["steps", 0, "inputs", 1, "source"], DOCUMENT)).toBe("input “path” › source");
    expect(fieldName(["steps", 0, "outputs", 0], DOCUMENT)).toBe("output “text”");
    expect(fieldName(["steps", 0, "outputs", 5], DOCUMENT)).toBe("output 6");
    expect(
      fieldName(["steps", 0, "outputs", 0, "name"], { steps: [{ outputs: [{ name: "" }] }] }),
    ).toBe("output 1 › name");
    expect(fieldName(["steps", 0, "conditions", 0, "expected"], DOCUMENT)).toBe(
      "condition 1 › expected",
    );
    expect(fieldName(["steps", 0, "retry_policy", "max_attempts"], DOCUMENT)).toBe(
      "retries › attempts",
    );
  });

  it("names the workflow's own fields as the workflow's", () => {
    expect(fieldName(["metadata", "version"], DOCUMENT)).toBe("the workflow’s version");
    expect(fieldName(["result"], DOCUMENT)).toBe("result");
    expect(fieldName([], DOCUMENT)).toBe("");
  });
});

describe("worded", () => {
  it("says the commonest refusals in plain words", () => {
    expect(
      worded(problem("Field required", ["steps", 1, "specification", "model_selection"]), DOCUMENT),
    ).toBe("Model selection is missing.");
    expect(
      worded(
        problem("String should have at least 1 character", [
          "steps",
          0,
          "specification",
          "requirement",
          "name",
        ]),
        DOCUMENT,
      ),
    ).toBe("Tool › name can’t be empty.");
    expect(
      worded(problem("Input should be a valid string", ["metadata", "version"]), DOCUMENT),
    ).toBe("The workflow’s version must be text.");
    expect(
      worded(
        problem("Input should be a valid UUID, invalid character", ["steps", 0, "id"]),
        DOCUMENT,
      ),
    ).toBe("Id must be a UUID.");
  });

  it("keeps Azathoth's own words for anything else, after the field they are about", () => {
    expect(
      worded(
        problem("Input should be greater than 0", ["steps", 0, "retry_policy", "max_attempts"]),
        DOCUMENT,
      ),
    ).toBe("Retries › attempts: Input should be greater than 0");
    expect(
      worded(
        problem("Workflow step dependencies must reference steps in the same workflow.", []),
        DOCUMENT,
      ),
    ).toBe("Workflow step dependencies must reference steps in the same workflow.");
    expect(worded(problem("Field required", []), DOCUMENT)).toBe("It is missing.");
  });
});

describe("problemsOf", () => {
  it("says each of Azathoth's problems in words, with the step it is in", () => {
    expect(
      problemsOf(
        {
          valid: false,
          problems: [
            problem("A workflow needs a result to be imported.", ["result"]),
            problem("Field required", ["steps", 1, "specification", "model_selection"], SUMMARIZE),
            problem(
              "String should have at least 1 character",
              ["steps", 0, "outputs", 0, "name"],
              PICK,
            ),
          ],
        },
        DOCUMENT,
      ),
    ).toEqual([
      { step: null, message: "Result: A workflow needs a result to be imported." },
      { step: SUMMARIZE, message: "Model selection is missing." },
      { step: PICK, message: "Output “text” › name can’t be empty." },
    ]);
    expect(problemsOf({ valid: true, problems: [] }, DOCUMENT)).toEqual([]);
  });
});

describe("titleOf", () => {
  it("names a step by its prompt or its tool", () => {
    const [pick, summarize] = stepsOf(DOCUMENT);

    expect(titleOf(pick ?? {})).toBe("json_select");
    expect(titleOf(summarize ?? {})).toBe("Summarize");
    expect(titleOf({})).toBe("an unnamed step");
    expect(titleOf({ specification: { metadata: { name: " " } } })).toBe("an unnamed step");
  });
});

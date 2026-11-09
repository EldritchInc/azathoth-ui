import { describe, expect, it } from "vitest";

import { addDependency, addStep, addOutput, connect, setStepName } from "./editing";
import {
  formatConstant,
  formatPath,
  highlightParts,
  namesFromDependencies,
  parseConstant,
  parsePath,
  sourceChoices,
} from "./forms";
import { uuid, VALID_DOCUMENT } from "./test/documents";

const SELECT = uuid(11);
const SUMMARIZE = uuid(12);

describe("parsePath and formatPath", () => {
  it("reads keys between dots, and whole numbers as places in a list", () => {
    expect(parsePath("choices.0.text")).toEqual(["choices", 0, "text"]);
    expect(formatPath(["choices", 0, "text"])).toBe("choices.0.text");
  });

  it("reads nothing as the whole reply", () => {
    expect(parsePath("")).toEqual([]);
    expect(formatPath([])).toBe("");
    expect(formatPath(undefined)).toBe("");
  });

  it("keeps what is not a whole number as a key, so typing it reads back the same", () => {
    expect(parsePath("a.01")).toEqual(["a", "01"]);
    expect(parsePath("a.-1")).toEqual(["a", "-1"]);
    expect(parsePath("a.")).toEqual(["a", ""]);
    expect(formatPath(parsePath("a."))).toBe("a.");
  });
});

describe("parseConstant and formatConstant", () => {
  it("reads JSON as JSON, and anything else as text", () => {
    expect(parseConstant("12")).toBe(12);
    expect(parseConstant("true")).toBe(true);
    expect(parseConstant('["text"]')).toEqual(["text"]);
    expect(parseConstant("hello there")).toBe("hello there");
    expect(parseConstant("")).toBe("");
  });

  it("writes text as it is, unless it would read back as something else", () => {
    expect(formatConstant("hello")).toBe("hello");
    expect(formatConstant("true")).toBe('"true"');
    expect(formatConstant("12")).toBe('"12"');
    expect(formatConstant(["text"])).toBe('["text"]');
    expect(formatConstant(null)).toBe("null");
  });

  it("reads back each constant it writes", () => {
    for (const value of ["plain", "true", "", '"quoted"', 3, false, null, { a: [1] }]) {
      expect(parseConstant(formatConstant(value))).toEqual(value);
    }
  });
});

describe("sourceChoices", () => {
  it("offers the outputs of the steps a step runs after", () => {
    expect(sourceChoices(VALID_DOCUMENT, SUMMARIZE)).toEqual([
      { step: SELECT, title: "json_select", name: "text", upstream: true },
      { step: SELECT, title: "json_select", name: "length", upstream: true },
    ]);
  });

  it("offers nothing of the step itself, or of what runs after it", () => {
    expect(sourceChoices(VALID_DOCUMENT, SELECT)).toEqual([]);
  });

  it("offers a step it does not run after yet, after those it does", () => {
    const other = uuid(13);
    const document = addOutput(
      setStepName(addStep(VALID_DOCUMENT, "prompt", { step: other }), other, "Other"),
      other,
      "note",
    );

    expect(sourceChoices(document, SUMMARIZE).map((choice) => choice.name)).toEqual([
      "text",
      "length",
      "note",
    ]);
    expect(sourceChoices(document, SUMMARIZE)[2]).toEqual({
      step: other,
      title: "Other",
      name: "note",
      upstream: false,
    });
    expect(sourceChoices(addDependency(document, other, SUMMARIZE), SUMMARIZE)).toHaveLength(2);
  });

  it("offers no output without a name", () => {
    const document = addOutput(VALID_DOCUMENT, SELECT, "");

    expect(sourceChoices(document, SUMMARIZE)).toHaveLength(2);
  });

  it("counts a step run after through another as upstream", () => {
    const last = uuid(13);
    const document = addStep(VALID_DOCUMENT, "tool", { step: last }, [SUMMARIZE]);

    expect(sourceChoices(document, last).map((choice) => [choice.name, choice.upstream])).toEqual([
      ["text", true],
      ["length", true],
      ["summary", true],
    ]);
  });
});

describe("namesFromDependencies", () => {
  it("names what the steps a step runs after directly write, each once", () => {
    const twin = uuid(13);
    const last = uuid(14);
    const document = connect(
      addOutput(addStep(VALID_DOCUMENT, "tool", { step: twin }), twin, "text"),
      twin,
      SUMMARIZE,
    );

    expect(namesFromDependencies(document, SUMMARIZE)).toEqual(["text", "length"]);
    expect(namesFromDependencies(document, SELECT)).toEqual([]);
    expect(
      namesFromDependencies(addStep(document, "tool", { step: last }, [SUMMARIZE]), last),
    ).toEqual(["summary"]);
  });
});

describe("highlightParts", () => {
  it("splits a prompt around its variables, which joined is the prompt again", () => {
    const prompt = "Summarize {ticket} for {reader:>10}.";
    const parts = highlightParts(prompt);

    expect(parts).toEqual([
      { text: "Summarize ", variable: null },
      { text: "{ticket}", variable: "ticket" },
      { text: " for ", variable: null },
      { text: "{reader:>10}", variable: "reader" },
      { text: ".", variable: null },
    ]);
    expect(parts.map((part) => part.text).join("")).toBe(prompt);
  });

  it("keeps doubled braces, empty braces and a brace never closed as plain text", () => {
    expect(highlightParts("{{not}} {} {open")).toEqual([
      { text: "{{not}} {} {open", variable: null },
    ]);
    expect(highlightParts("{a}{b")).toEqual([
      { text: "{a}", variable: "a" },
      { text: "{b", variable: null },
    ]);
  });

  it("has no parts for no prompt", () => {
    expect(highlightParts("")).toEqual([]);
  });
});

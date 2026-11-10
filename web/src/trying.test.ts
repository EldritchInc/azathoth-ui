import { describe, expect, it } from "vitest";

import { isStepTrial } from "./api/types";
import { NEW_DRAFT, type InputDraft } from "./runInput";
import { uuid, VALID_DOCUMENT } from "./test/documents";
import { SELECTED, TRIAL } from "./test/runs";
import {
  inputDraft,
  needsRunInput,
  NEW_TRIAL,
  trialInputs,
  trialStart,
  type TrialDraft,
} from "./trying";

const SELECT = uuid(11);
const SUMMARIZE = uuid(12);
const FILE = { media_type: "text/plain", content: "b25l" };

function given(inputs: Record<string, Partial<InputDraft>>, run: Partial<InputDraft> = {}) {
  return {
    inputs: Object.fromEntries(
      Object.entries(inputs).map(([name, draft]) => [name, { ...NEW_DRAFT, ...draft }]),
    ),
    run: { ...NEW_DRAFT, ...run },
  } satisfies TrialDraft;
}

describe("trialInputs", () => {
  it("says which inputs may be left to read as written: a constant, or the run's input", () => {
    expect(trialInputs(VALID_DOCUMENT, SELECT)).toEqual([
      { name: "value", from: "the workflow's input", optional: true, readsRun: true },
      { name: "path", from: 'the constant ["text"]', optional: true, readsRun: false },
    ]);
  });

  it("says an input another step gives must be given, as no step gives it here", () => {
    expect(trialInputs(VALID_DOCUMENT, SUMMARIZE)).toEqual([
      { name: "ticket", from: "json_select: text", optional: false, readsRun: false },
    ]);
    expect(trialInputs(VALID_DOCUMENT, uuid(99))).toEqual([]);
  });
});

describe("inputDraft", () => {
  it("leaves an input that may be as written, and asks text of one that must be given", () => {
    const [value] = trialInputs(VALID_DOCUMENT, SELECT);
    const [ticket] = trialInputs(VALID_DOCUMENT, SUMMARIZE);

    expect(value && inputDraft(NEW_TRIAL, value)).toEqual({ ...NEW_DRAFT, mode: "none" });
    expect(ticket && inputDraft(NEW_TRIAL, ticket)).toEqual(NEW_DRAFT);
    expect(ticket && inputDraft(given({ ticket: { mode: "json" } }), ticket)).toEqual({
      ...NEW_DRAFT,
      mode: "json",
    });
  });
});

describe("needsRunInput", () => {
  it("asks for the run's input only while an input is left to read it", () => {
    const inputs = trialInputs(VALID_DOCUMENT, SELECT);

    expect(needsRunInput(inputs, NEW_TRIAL)).toBe(true);
    expect(needsRunInput(inputs, given({ value: { mode: "text" } }))).toBe(false);
    expect(needsRunInput(trialInputs(VALID_DOCUMENT, SUMMARIZE), NEW_TRIAL)).toBe(false);
  });
});

describe("trialStart", () => {
  it("sends the step's given values and files, and the run's input for the inputs reading it", () => {
    const inputs = trialInputs(VALID_DOCUMENT, SELECT);

    expect(trialStart(VALID_DOCUMENT, SELECT, inputs, given({}, { text: "A ticket." }))).toEqual({
      ok: true,
      start: {
        document: VALID_DOCUMENT,
        step_id: SELECT,
        inputs: {},
        files: {},
        input: "A ticket.",
      },
    });
    expect(
      trialStart(
        VALID_DOCUMENT,
        SELECT,
        inputs,
        given({ value: { mode: "file", file: { name: "a.txt", size: 3, sent: FILE } } }),
      ),
    ).toEqual({
      ok: true,
      start: { document: VALID_DOCUMENT, step_id: SELECT, inputs: {}, files: { value: FILE } },
    });
    expect(
      trialStart(
        VALID_DOCUMENT,
        SELECT,
        inputs,
        given({}, { mode: "file", file: { name: "a.txt", size: 3, sent: FILE } }),
      ),
    ).toMatchObject({ ok: true, start: { file: FILE } });
    expect(trialStart(VALID_DOCUMENT, SELECT, inputs, given({}, { mode: "none" }))).toEqual({
      ok: true,
      start: { document: VALID_DOCUMENT, step_id: SELECT, inputs: {}, files: {} },
    });
  });

  it("sends each input given as text or JSON as its value", () => {
    const inputs = trialInputs(VALID_DOCUMENT, SELECT);

    expect(
      trialStart(
        VALID_DOCUMENT,
        SELECT,
        inputs,
        given({ value: { mode: "json", json: '{"text": "Hi"}' }, path: { text: "x" } }),
      ),
    ).toEqual({
      ok: true,
      start: {
        document: VALID_DOCUMENT,
        step_id: SELECT,
        inputs: { value: { text: "Hi" }, path: "x" },
        files: {},
      },
    });
    expect(
      trialStart(VALID_DOCUMENT, SUMMARIZE, trialInputs(VALID_DOCUMENT, SUMMARIZE), NEW_TRIAL),
    ).toMatchObject({ ok: true, start: { inputs: { ticket: "" } } });
  });

  it("says what is missing before it sends anything", () => {
    const inputs = trialInputs(VALID_DOCUMENT, SELECT);

    const unread = trialStart(
      VALID_DOCUMENT,
      SELECT,
      inputs,
      given({ value: { mode: "json", json: "{" } }),
    );

    expect(unread.ok).toBe(false);
    expect(unread.ok ? null : unread.problem).toMatch(/^“value”: This isn't JSON yet: /);
    expect(trialStart(VALID_DOCUMENT, SELECT, inputs, given({ path: { mode: "file" } }))).toEqual({
      ok: false,
      problem: "“path”: Choose a file, or drop one here.",
    });
    expect(trialStart(VALID_DOCUMENT, SELECT, inputs, given({}, { mode: "file" }))).toEqual({
      ok: false,
      problem: "The run’s input: Choose a file, or drop one here.",
    });
  });
});

describe("isStepTrial", () => {
  it("knows what trying a step did", () => {
    expect(isStepTrial(TRIAL)).toBe(true);
    expect(isStepTrial({ ...TRIAL, warnings: ["a callback raised"] })).toBe(true);
    expect(isStepTrial({ ...TRIAL, warnings: [1] })).toBe(false);
    expect(isStepTrial({ step: { ...SELECTED, status: "late" }, warnings: [] })).toBe(false);
    expect(isStepTrial({ step: SELECTED })).toBe(false);
    expect(isStepTrial(null)).toBe(false);
  });
});

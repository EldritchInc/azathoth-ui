import { describe, expect, it } from "vitest";

import { MAX_INPUT_FILE_BYTES, startBody } from "./api/client";
import { isLiveRun, isRunEvent, isRunResult, type LiveRun, type RunEvent } from "./api/types";
import {
  base64Of,
  duration,
  eventLine,
  fileProblem,
  mediaTypeOf,
  megabytes,
  outcomeName,
  progressOf,
  readJson,
  stepState,
} from "./running";
import { givenOf, NEW_DRAFT } from "./runInput";
import { LIVE_RUN, RUN_EVENTS, RUN_RESULT, SELECT, SUMMARIZE } from "./test/runs";

const COUNT = SELECT;
const NEXT = SUMMARIZE;

function titleOf(step: string): string {
  return step === COUNT ? "Count" : "Next";
}

describe("progressOf", () => {
  it("follows each step from waiting to how it ended, gathering its values", () => {
    const progress = progressOf(RUN_EVENTS);
    const count = progress.steps.get(COUNT);

    expect(count?.state).toBe("executed");
    expect(count?.layer).toBe(0);
    expect(count?.values).toEqual({ text: "A ticket.", length: 9 });
    expect(progress.runId).toBe(RUN_RESULT.run_id);
    expect(progress.succeeded).toBe(true);
    expect(stepState(progress, NEXT)).toBe("waiting");
  });

  it("says a step is running, with what it says, until it finishes", () => {
    const started: RunEvent[] = [
      { type: "run_started", workflow_id: LIVE_RUN.workflow_id },
      { type: "step_started", step_id: NEXT, layer: 1, message: "Reading" },
    ];
    const running = progressOf(started).steps.get(NEXT);

    expect(running?.state).toBe("running");
    expect(running?.message).toBe("Reading");
    expect(stepState(progressOf(started), NEXT)).toBe("running");
    expect(stepState(progressOf(started), NEXT, true)).toBe("stopped");
    expect(stepState(progressOf(RUN_EVENTS), COUNT, true)).toBe("executed");
    expect(progressOf(started).runId).toBeNull();
    expect(progressOf(started).succeeded).toBeNull();

    const failed = progressOf([
      ...started,
      {
        type: "step_finished",
        step_id: NEXT,
        layer: 1,
        status: "failed",
        failure: "Boom.",
        confidence: null,
      },
    ]).steps.get(NEXT);

    expect(failed?.state).toBe("failed");
    expect(failed?.message).toBeNull();
    expect(failed?.failure).toBe("Boom.");
  });

  it("keeps every value a step adds, the later over the earlier", () => {
    const progress = progressOf([
      { type: "context_changed", step_id: COUNT, values: { a: 1, b: 2 } },
      { type: "context_changed", step_id: COUNT, values: { b: 3 } },
    ]);

    expect(progress.steps.get(COUNT)?.values).toEqual({ a: 1, b: 3 });
    expect(progress.steps.get(COUNT)?.state).toBe("waiting");
  });
});

describe("eventLine", () => {
  it("says what each event means, naming its step", () => {
    expect(RUN_EVENTS.map((event) => eventLine(event, titleOf))).toEqual([
      "The run started.",
      "Count started.",
      "Count finished.",
      "Count added text, length.",
      "The run succeeded.",
    ]);
    expect(
      eventLine({ type: "step_started", step_id: NEXT, layer: 1, message: "Reading" }, titleOf),
    ).toBe("Next started: “Reading”");
    expect(
      eventLine(
        {
          type: "step_finished",
          step_id: NEXT,
          layer: 1,
          status: "failed",
          failure: "Boom.",
          confidence: null,
        },
        titleOf,
      ),
    ).toBe("Next failed: Boom.");
    expect(
      eventLine(
        {
          type: "step_finished",
          step_id: NEXT,
          layer: 1,
          status: "failed",
          failure: null,
          confidence: null,
        },
        titleOf,
      ),
    ).toBe("Next failed.");
    expect(
      eventLine(
        {
          type: "step_finished",
          step_id: NEXT,
          layer: 1,
          status: "skipped",
          failure: null,
          confidence: null,
        },
        titleOf,
      ),
    ).toBe("Next was skipped.");
    expect(eventLine({ type: "context_changed", step_id: NEXT, values: {} }, titleOf)).toBe(
      "Next added nothing to the context.",
    );
    expect(eventLine({ type: "run_finished", run_id: "r", succeeded: false }, titleOf)).toBe(
      "The run failed.",
    );
  });
});

describe("outcomeName", () => {
  it("names a finished run by whether it succeeded, and any other by its state", () => {
    expect(outcomeName({ ...LIVE_RUN, state: "finished" }, true)).toBe("Succeeded");
    expect(outcomeName({ ...LIVE_RUN, state: "finished" }, false)).toBe("Failed");
    expect(outcomeName({ ...LIVE_RUN, state: "running" }, null)).toBe("Running");
    expect(outcomeName({ ...LIVE_RUN, state: "cancelled" }, null)).toBe("Cancelled");
    expect(outcomeName({ ...LIVE_RUN, state: "refused" }, null)).toBe("Refused");
  });
});

describe("duration", () => {
  const start = "2026-11-10T10:00:00Z";

  it("says how long passed, to a tenth of a second while short", () => {
    expect(duration(start, "2026-11-10T10:00:00.400Z")).toBe("0.4 s");
    expect(duration(start, "2026-11-10T10:00:12.600Z")).toBe("13 s");
    expect(duration(start, "2026-11-10T10:01:00Z")).toBe("1 min");
    expect(duration(start, "2026-11-10T10:01:05Z")).toBe("1 min 5 s");
    expect(duration(start, "2026-11-10T09:59:00Z")).toBe("0.0 s");
  });

  it("measures to now while a run has not finished", () => {
    expect(duration(start, null, new Date("2026-11-10T10:00:03Z"))).toBe("3.0 s");
  });
});

describe("readJson", () => {
  it("reads any JSON value, and says why text is not JSON", () => {
    expect(readJson('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(readJson("null")).toEqual({ ok: true, value: null });
    expect(readJson(" 3 ")).toEqual({ ok: true, value: 3 });
    expect(readJson("  ")).toEqual({
      ok: false,
      problem: 'Write the input as JSON, such as {"text": "…"}.',
    });

    const broken = readJson("{nope");

    expect(broken.ok).toBe(false);
    expect(!broken.ok && broken.problem.startsWith("This isn't JSON yet: ")).toBe(true);
  });
});

describe("files", () => {
  it("are taken as their media type, or by their name when the browser gives none", () => {
    expect(mediaTypeOf("a.pdf", "application/pdf")).toBe("application/pdf");
    expect(mediaTypeOf("a.png", "IMAGE/PNG")).toBe("image/png");
    expect(mediaTypeOf("notes.md", "text/markdown; charset=utf-8")).toBe("text/markdown");
    expect(mediaTypeOf("a.json", "application/json")).toBe("application/json");
    expect(mediaTypeOf("notes.md", "")).toBe("text/markdown");
    expect(mediaTypeOf("scan.JPG", "application/octet-stream")).toBe("image/jpeg");
    expect(mediaTypeOf("a.webp", "")).toBe("image/webp");
    expect(mediaTypeOf("README", "")).toBeNull();
    expect(mediaTypeOf("a.gif", "image/gif")).toBeNull();
    expect(mediaTypeOf("a.zip", "")).toBeNull();
  });

  it("are refused when Azathoth takes no such file, or one so large", () => {
    expect(fileProblem("a.pdf", "application/pdf", MAX_INPUT_FILE_BYTES)).toBeNull();
    expect(fileProblem("a.gif", "image/gif", 10)).toBe(
      "Azathoth takes JSON, text, PDF, PNG, JPEG and WebP files; a.gif isn't one.",
    );
    expect(fileProblem("a.pdf", "application/pdf", MAX_INPUT_FILE_BYTES + 1)).toBe(
      "a.pdf is 10.0 MB; a run's file may be at most 10 MB.",
    );
  });

  it("are measured as people read sizes", () => {
    expect(megabytes(10)).toBe("1 KB");
    expect(megabytes(812 * 1024)).toBe("812 KB");
    expect(megabytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
  });

  it("are sent in base64", () => {
    expect(base64Of(new TextEncoder().encode("one two"))).toBe("b25lIHR3bw==");
    expect(base64Of(new Uint8Array(70_000).fill(255)).length).toBe(93_336);
    expect(base64Of(new Uint8Array(3 * 1024 * 1024)).length).toBe(4 * 1024 * 1024);
  });
});

describe("startBody", () => {
  it("gives a run its JSON, a file, or nothing", () => {
    expect(startBody("w", { kind: "json", value: null })).toEqual({
      workflow_id: "w",
      input: null,
    });
    expect(
      startBody("w", { kind: "file", file: { media_type: "text/plain", content: "eA==" } }),
    ).toEqual({ workflow_id: "w", file: { media_type: "text/plain", content: "eA==" } });
    expect(startBody("w", { kind: "none" })).toEqual({ workflow_id: "w" });
  });
});

describe("the guards", () => {
  it("know a live run, an event and a result", () => {
    const finished: LiveRun = { ...LIVE_RUN, state: "finished", result: { ...RUN_RESULT } };

    expect(isLiveRun(LIVE_RUN)).toBe(true);
    expect(isLiveRun(finished)).toBe(true);
    expect(isLiveRun({ ...LIVE_RUN, state: "paused" })).toBe(false);
    expect(isLiveRun({ ...LIVE_RUN, error: { code: 1 } })).toBe(false);
    expect(RUN_EVENTS.every(isRunEvent)).toBe(true);
    expect(
      isRunEvent({
        type: "step_finished",
        step_id: COUNT,
        layer: 0,
        status: "late",
        failure: null,
        confidence: null,
      }),
    ).toBe(false);
    expect(isRunEvent({ type: "invocation_finished" })).toBe(false);
    expect(isRunResult(RUN_RESULT)).toBe(true);
    expect(isRunResult({ ...RUN_RESULT, succeeded: "yes" })).toBe(false);
  });
});

describe("givenOf", () => {
  const file = {
    name: "a.txt",
    size: 3,
    sent: { media_type: "text/plain", content: "eA==" },
  };

  it("gives a run its text, its JSON, its file, or nothing", () => {
    expect(givenOf({ ...NEW_DRAFT, text: "hi" })).toEqual({
      given: { kind: "json", value: "hi" },
      problem: null,
    });
    expect(givenOf({ ...NEW_DRAFT, mode: "json", json: "[1]" })).toEqual({
      given: { kind: "json", value: [1] },
      problem: null,
    });
    expect(givenOf({ ...NEW_DRAFT, mode: "file", file })).toEqual({
      given: { kind: "file", file: file.sent },
      problem: null,
    });
    expect(givenOf({ ...NEW_DRAFT, mode: "none", text: "ignored" })).toEqual({
      given: { kind: "none" },
      problem: null,
    });
  });

  it("gives nothing yet while the JSON doesn't read, or no file is chosen", () => {
    expect(givenOf({ ...NEW_DRAFT, mode: "json", json: "{" }).given).toBeNull();
    expect(givenOf({ ...NEW_DRAFT, mode: "file" })).toEqual({
      given: null,
      problem: "Choose a file, or drop one here.",
    });
  });
});

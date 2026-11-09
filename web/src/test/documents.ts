/**
 * Documents as Azathoth stores them, for tests of the pages that show them.
 */

import type { ComponentDetail, Summary } from "../api/types";
import { BENCHMARK, TOOL, WORKFLOW } from "./instances";

const NO_REQUIREMENTS = {
  required_capabilities: [],
  required_input_modalities: ["text"],
  required_output_modalities: ["text"],
  minimum_context_window_tokens: null,
  minimum_output_tokens: null,
  maximum_input_usd_per_million_tokens: null,
  maximum_output_usd_per_million_tokens: null,
  require_known_pricing: false,
};

const RETRY_ONCE = {
  max_attempts: 2,
  initial_delay_seconds: 0,
  backoff_multiplier: 1,
  maximum_delay_seconds: null,
};

/** A workflow with a prompt step, a tool step after it, and a step that runs on a condition. */
export const REVIEW_DOCUMENT = {
  metadata: {
    id: "d2000000-0000-4000-8000-000000000010",
    name: "review change",
    description: "Review a code change.",
    version: "1.2.0",
  },
  steps: [
    {
      id: "step-review",
      specification: {
        metadata: {
          id: "spec-review",
          name: "Review security",
          description: "Review a change for security problems.",
          version: "1.0.0",
        },
        template: {
          text: "You review code changes for security.\n{change}",
          bindings: [{ variable_name: "change", input_name: "change" }],
        },
        model_selection: {
          requirements: {
            ...NO_REQUIREMENTS,
            required_capabilities: ["json_mode"],
            required_input_modalities: ["text", "image"],
            minimum_context_window_tokens: 128000,
            maximum_input_usd_per_million_tokens: 3,
            require_known_pricing: true,
          },
        },
        output_format: "json",
      },
      depends_on: [],
      inputs: [
        { name: "change", source: { event_type: "workflow.input.received", field_name: "input" } },
      ],
      outputs: [{ name: "security", path: ["findings"] }],
      conditions: [],
      retry_policy: RETRY_ONCE,
      failure_policy: "fail_workflow",
      message: "Reviewing security",
    },
    {
      id: "step-merge",
      specification: {
        requirement: { name: "merge_reviews", version: "1.0.0", runtime: "python" },
      },
      depends_on: ["step-review"],
      inputs: [
        { name: "security", source: { producer_step_id: "step-review", name: "security" } },
        { name: "limit", source: { value: 10 } },
        { name: "notes", source: { name: "notes" } },
      ],
      outputs: [
        { name: "review", path: ["review"] },
        { name: "has_findings", path: ["has_findings"] },
      ],
      conditions: [],
      retry_policy: { ...RETRY_ONCE, max_attempts: 1 },
      failure_policy: "continue_workflow",
    },
    {
      id: "step-summary",
      specification: {
        metadata: { id: "spec-summary", name: "Summarize review", version: "1.0.0" },
        prompt: { text: "Write the review comment." },
        model_selection: { requirements: NO_REQUIREMENTS },
      },
      depends_on: ["step-merge", "step-gone"],
      inputs: [{ name: "review", source: { producer_step_id: "step-merge", name: "review" } }],
      outputs: [{ name: "summary", path: [] }],
      conditions: [
        {
          source: { producer_step_id: "step-merge", name: "has_findings" },
          operator: "equal",
          expected: true,
        },
      ],
      retry_policy: RETRY_ONCE,
      failure_policy: "fail_workflow",
    },
  ],
  result: { name: "summary" },
};

function reviewer(id: string, name: string) {
  return {
    id,
    specification: {
      metadata: { id: `spec-${id}`, name, version: "1.0.0" },
      template: { text: `Review the change for ${name}.`, bindings: [] },
      model_selection: { requirements: NO_REQUIREMENTS },
    },
    depends_on: [],
    inputs: [],
    outputs: [{ name: id, path: [] }],
  };
}

/**
 * A workflow whose three reviews can run at once, then a merge after all
 * three, then a summary after the merge.
 */
export const LAYERED_DOCUMENT = {
  metadata: { id: "layered", name: "layered review", version: "1.0.0" },
  steps: [
    reviewer("security", "Security"),
    reviewer("correctness", "Correctness"),
    {
      id: "merge",
      specification: {
        requirement: { name: "merge_reviews", version: "1.0.0", runtime: "python" },
      },
      depends_on: ["security", "correctness", "readability"],
      inputs: [],
      outputs: [{ name: "review", path: [] }],
    },
    reviewer("readability", "Readability"),
    {
      id: "summary",
      specification: {
        metadata: { id: "spec-summary", name: "Summary", version: "1.0.0" },
        prompt: { text: "Summarize." },
      },
      depends_on: ["merge"],
      inputs: [],
      outputs: [{ name: "summary", path: [] }],
    },
  ],
  result: { name: "summary" },
};

function triageStep(id: string, name: string, fields: Record<string, unknown>) {
  return {
    id,
    specification: {
      metadata: { id: `spec-${id}`, name, version: "1.0.0" },
      prompt: { text: name },
    },
    depends_on: [],
    inputs: [],
    outputs: [],
    conditions: [],
    ...fields,
  };
}

const TICKET = {
  name: "ticket",
  source: { event_type: "workflow.input.received", field_name: "input" },
};

function draft(kind: string, outputs: readonly string[]) {
  return triageStep(`draft-${kind}`, `Draft ${kind} reply`, {
    depends_on: ["classify"],
    inputs: [TICKET, { name: "notes", source: { name: "notes" } }],
    outputs: outputs.map((name) => ({ name, path: [] })),
    conditions: [
      {
        source: { producer_step_id: "classify", name: "category" },
        operator: "equal",
        expected: kind,
      },
    ],
  });
}

/**
 * A workflow that classifies a ticket, drafts a reply on one of three
 * branches beside a step that only records the triage, merges the drafts it
 * finds in the context, and polishes the answer, which the polish writes
 * again under the same name.
 *
 * The question branch also adds to the context's notes, which its sibling
 * branches read alongside it, so they read the classifier's notes only.
 */
export const TRIAGE_DOCUMENT = {
  metadata: { id: "triage", name: "triage ticket", version: "1.0.0" },
  steps: [
    triageStep("classify", "Classify ticket", {
      inputs: [TICKET],
      outputs: [
        { name: "category", path: ["category"] },
        { name: "notes", path: ["notes"] },
      ],
    }),
    triageStep("log", "Record triage", { depends_on: ["classify"] }),
    draft("bug", ["reply"]),
    draft("feature", ["reply"]),
    draft("question", ["reply", "notes"]),
    {
      id: "merge",
      specification: {
        requirement: { name: "merge_replies", version: "1.0.0", runtime: "python" },
      },
      depends_on: ["draft-bug", "draft-feature", "draft-question", "log"],
      inputs: [
        { name: "reply", source: { name: "reply" } },
        { name: "limit", source: { value: 3 } },
      ],
      outputs: [{ name: "answer", path: [] }],
      conditions: [],
    },
    triageStep("polish", "Polish answer", {
      depends_on: ["merge"],
      inputs: [
        { name: "answer", source: { producer_step_id: "merge", name: "answer" } },
        { name: "notes", source: { name: "notes" } },
      ],
      outputs: [{ name: "answer", path: [] }],
    }),
  ],
  result: { name: "answer" },
};

/** The workflow's latest revision, as the API answers it. */
export const WORKFLOW_DETAIL: ComponentDetail = {
  ...WORKFLOW,
  revision: { ...WORKFLOW.revision, number: 3, identical_to: null },
  command: `azathoth workflow show ${WORKFLOW.id} --revision 3`,
  latest_number: 3,
  document: REVIEW_DOCUMENT,
};

/** The workflow's revisions, newest first. */
export const WORKFLOW_HISTORY: Summary[] = [3, 2, 1].map((number) => ({
  ...WORKFLOW,
  revision: {
    number,
    content_digest: String(number).repeat(64),
    imported_at: `2026-11-0${String(number + 5)}T12:00:00Z`,
    identical_to: number === 2 ? 1 : null,
  },
  command: `azathoth workflow show ${WORKFLOW.id} --revision ${String(number)}`,
}));

/** A tool version's document: schemas, one implementation and one test. */
export const TOOL_DOCUMENT = {
  definition: {
    id: TOOL.id,
    name: "count_words",
    description: "Count the words in a text.",
    version: "1.0.0",
    input_schema: {
      json_schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text to count." },
          separators: { type: "array", items: { type: "string" } },
          mode: { enum: ["words", "lines"] },
          strict: { type: ["boolean", "null"] },
        },
        required: ["text"],
      },
    },
    output_schema: { json_schema: { type: "object" } },
  },
  implementations: [
    {
      id: "implementation",
      tool_id: TOOL.id,
      tool_version: "1.0.0",
      version: "1.0.0",
      runtime: "python",
      entrypoint: "run",
      source: 'def run(text):\n    return {"count": len(text.split())}\n',
    },
  ],
  test_cases: [
    {
      id: "test",
      tool_id: TOOL.id,
      name: "counts two words",
      description: "Verify a two-word input.",
      inputs: { text: "hello world" },
      expected_output: { count: 2 },
    },
  ],
};

/** The tool version's latest revision. */
export const TOOL_DETAIL: ComponentDetail = {
  ...TOOL,
  command: `azathoth tool export ${TOOL.id} --version 1.0.0 --revision 1`,
  latest_number: 1,
  document: TOOL_DOCUMENT,
};

/** A benchmark's document, with a text case and a structured one. */
export const BENCHMARK_DOCUMENT = {
  id: BENCHMARK.id,
  name: "word count",
  description: "Count the words in a text.",
  version: "1.0.0",
  cases: [
    {
      id: "case-1",
      input: "that is not dead which can eternal lie",
      expected: { description: "Eight words.", value: 8, comparison: "exact" },
      metadata: {},
    },
    {
      id: "case-2",
      input: { text: "strange aeons" },
      expected: { value: { count: 2 }, comparison: "semantic" },
      metadata: {},
    },
  ],
};

/** The benchmark's latest revision. */
export const BENCHMARK_DETAIL: ComponentDetail = {
  ...BENCHMARK,
  command: `azathoth benchmark show ${BENCHMARK.id} --revision 1`,
  latest_number: 1,
  document: BENCHMARK_DOCUMENT,
};

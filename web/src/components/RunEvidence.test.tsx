import { fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import {
  ANNOTATIONS,
  CHILDREN,
  CITATION,
  FINISHED_CHILD,
  UNFINISHED_CHILD,
} from "../test/evidence";
import { SERVER, WORKFLOW, type Answers } from "../test/instances";
import { renderAt } from "../test/render";
import { RUN_DETAIL, RUN_WORKFLOW } from "../test/runs";
import { RESTRICTED_RUN } from "../test/sensitivity";
import { RunPage } from "./RunPage";

const RUN_PATH = `/api/runs/${RUN_DETAIL.run_id}`;
const ANNOTATIONS_PATH = `${RUN_PATH}/annotations`;
const CHILDREN_PATH = `${RUN_PATH}/children`;

const ANSWERS: Answers = {
  ...SERVER,
  [RUN_PATH]: [200, RUN_DETAIL],
  [`${RUN_PATH}/feedback`]: [200, { items: [] }],
  [ANNOTATIONS_PATH]: [200, ANNOTATIONS],
  [CHILDREN_PATH]: [200, { items: CHILDREN }],
  [`/api/workflows/${WORKFLOW.id}?revision=3`]: [200, RUN_WORKFLOW],
};

function open(answers: Answers = ANSWERS) {
  renderAt(
    <Routes>
      <Route path="/runs/:runId" element={<RunPage />} />
    </Routes>,
    { path: `/runs/${RUN_DETAIL.run_id}`, answers },
  );
}

function section(name: string): Promise<HTMLElement> {
  return screen.findByRole("region", { name });
}

describe("a run's citations", () => {
  it("show what each quotes and where it was found, with how many were left out", async () => {
    open();

    const citations = within(await section("Citations"));
    const list = await citations.findByRole("list", { name: "Citations" });
    const [only] = within(list).getAllByRole("listitem");

    if (only === undefined) {
      throw new Error("One citation was expected.");
    }

    expect(citations.getByText(/1 verified, 1 not verified and left out\./)).toBeVisible();
    expect(within(only).getByText("My printer is on fire.")).toBeVisible();
    expect(within(only).getByText("Supports: the printer is on fire.")).toBeVisible();
    expect(
      within(only).getByRole("link", { name: "https://tickets.example.com/7" }),
    ).toHaveAttribute("href", "https://tickets.example.com/7");
    expect(citations.getByText(ANNOTATIONS.command)).toBeVisible();
  });

  it("name a source a browser can't open without linking it", async () => {
    const stored = {
      ...CITATION,
      target: { type: "SpecificResource", source: "ni:///sha-256;abc", selector: [] },
    };
    open({ ...ANSWERS, [ANNOTATIONS_PATH]: [200, { ...ANNOTATIONS, items: [stored] }] });

    const citations = within(await section("Citations"));

    expect(await citations.findByText("ni:///sha-256;abc")).toBeVisible();
    expect(citations.queryByRole("link", { name: "ni:///sha-256;abc" })).toBeNull();
  });

  it("say when no step cited a source", async () => {
    open({
      ...ANSWERS,
      [ANNOTATIONS_PATH]: [
        200,
        {
          ...ANNOTATIONS,
          collection: { ...ANNOTATIONS.collection, label: "Citations of run x: 0 verified." },
          items: [],
        },
      ],
    });

    const citations = within(await section("Citations"));

    expect(
      await citations.findByText("No step of this run kept a verified citation."),
    ).toBeVisible();
    expect(citations.queryByRole("list", { name: "Citations" })).toBeNull();
  });

  it("say when they can't be read", async () => {
    open({
      ...ANSWERS,
      [ANNOTATIONS_PATH]: [
        502,
        { error: { code: "content_unavailable", message: "The content store isn't answering." } },
      ],
    });

    const citations = within(await section("Citations"));

    expect(
      await citations.findByText("Couldn’t load its citations: The content store isn't answering."),
    ).toBeVisible();
  });

  it("are hidden for a restricted run until its data is shown", async () => {
    open({ ...ANSWERS, [RUN_PATH]: [200, RESTRICTED_RUN] });

    const citations = within(await section("Citations"));

    expect(
      await citations.findByRole("group", { name: "Restricted: its citations" }),
    ).toBeVisible();
    expect(citations.queryByText("My printer is on fire.")).toBeNull();

    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Restricted: the run's input, result and steps" }),
      ).getByRole("button", { name: "Show it" }),
    );

    expect(citations.getByText("My printer is on fire.")).toBeVisible();
  });
});

describe("a run's children", () => {
  it("list each run a step started, how it ended, and where to see it", async () => {
    open();

    const children = within(await section("Child runs"));
    const list = await children.findByRole("list", { name: "Child runs" });
    const [finished, unfinished] = within(list).getAllByRole("listitem");

    if (finished === undefined || unfinished === undefined) {
      throw new Error("Two children were expected.");
    }

    expect(within(finished).getByRole("link", { name: "review change" })).toHaveAttribute(
      "href",
      `/runs/${FINISHED_CHILD.child_run_id}`,
    );
    expect(within(finished).getByText("Succeeded")).toHaveAttribute("data-status", "succeeded");
    expect(finished).toHaveTextContent("Started by Summarize, attempt 1");
    expect(within(unfinished).getByText("Unfinished")).toHaveAttribute("data-status", "unfinished");
    expect(unfinished).toHaveTextContent("attempt 2");
    expect(within(unfinished).queryByRole("link", { name: "review change" })).toBeNull();
    expect(within(unfinished).getByRole("link", { name: "Its invocation" })).toHaveAttribute(
      "href",
      `/invocations/${UNFINISHED_CHILD.child_invocation_id ?? ""}`,
    );
  });

  it("say how far down a grandchild is", async () => {
    open({
      ...ANSWERS,
      [CHILDREN_PATH]: [200, { items: [{ ...FINISHED_CHILD, depth: 2 }] }],
    });

    const children = within(await section("Child runs"));

    expect(await children.findByText("2 levels down")).toBeVisible();
  });

  it("name a child's workflow by its id when this instance doesn't list it", async () => {
    open({
      ...ANSWERS,
      [CHILDREN_PATH]: [200, { items: [{ ...FINISHED_CHILD, child_workflow_id: "gone" }] }],
    });

    const children = within(await section("Child runs"));

    expect(await children.findByRole("link", { name: "Workflow gone" })).toBeVisible();
  });

  it("say when none of its steps started another run", async () => {
    open({ ...ANSWERS, [CHILDREN_PATH]: [200, { items: [] }] });

    const children = within(await section("Child runs"));

    expect(await children.findByText("None of its steps started another run.")).toBeVisible();
  });
});

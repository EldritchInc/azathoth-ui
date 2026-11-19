import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { BAD_JUDGMENT, GOOD_JUDGMENT, JUDGMENTS } from "../test/evidence";
import { SERVER, WORKFLOW, type Answers } from "../test/instances";
import { recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";
import { RUN_DETAIL, RUN_SUMMARY, RUN_WORKFLOW } from "../test/runs";
import { RESTRICTED_RUN } from "../test/sensitivity";
import { RunHistory } from "./RunHistory";
import { RunPage } from "./RunPage";

const RUN_PATH = `/api/runs/${RUN_DETAIL.run_id}`;
const FEEDBACK_PATH = `${RUN_PATH}/feedback`;

const ANSWERS: Answers = {
  ...SERVER,
  [RUN_PATH]: [200, RUN_DETAIL],
  [FEEDBACK_PATH]: [200, { items: JUDGMENTS }],
  [`/api/workflows/${WORKFLOW.id}?revision=3`]: [200, RUN_WORKFLOW],
};

function page(): { readonly path: string } {
  return { path: `/runs/${RUN_DETAIL.run_id}` };
}

function open(answers: Answers = ANSWERS) {
  renderAt(
    <Routes>
      <Route path="/runs/:runId" element={<RunPage />} />
    </Routes>,
    { ...page(), answers },
  );
}

function openRecording(posts: Answers, sent: Sent[], answers: Answers = ANSWERS) {
  renderAt(
    <Routes>
      <Route path="/runs/:runId" element={<RunPage />} />
    </Routes>,
    { ...page(), fetcher: recording(answers, posts, sent) },
  );
}

async function judgment(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "Judgment" });
}

async function form(): Promise<HTMLElement> {
  return within(await judgment()).findByRole("form", { name: "Judge this run" });
}

function posted(sent: readonly Sent[]): Sent[] {
  return sent.filter((request) => request.method === "POST");
}

describe("a run's judgment", () => {
  it("lists every judgment, newest first, with why and what it should have produced", async () => {
    open();

    const list = await within(await judgment()).findByRole("list", { name: "Judgments" });
    const [newest, oldest] = within(list).getAllByRole("listitem");

    if (newest === undefined || oldest === undefined) {
      throw new Error("Two judgments were expected.");
    }

    expect(within(newest).getByText("Bad")).toHaveAttribute("data-feedback", "bad");
    expect(newest).toHaveTextContent(BAD_JUDGMENT.reason ?? "");
    expect(
      within(newest).getByLabelText("What it should have produced, as JSON"),
    ).toHaveTextContent('"A printer is on fire."');
    expect(within(oldest).getByText("Good")).toHaveAttribute("data-feedback", "good");
    expect(within(oldest).queryByLabelText("What it should have produced, as JSON")).toBeNull();
    expect(within(await judgment()).getByText("Latest: bad")).toHaveAttribute(
      "data-feedback",
      "bad",
    );
  });

  it("asks for a reason before a bad judgment is sent", async () => {
    open();

    const judging = within(await form());

    fireEvent.click(judging.getByRole("radio", { name: "Bad" }));
    const record = judging.getByRole("button", { name: "Record judgment" });

    expect(record).toBeDisabled();

    fireEvent.change(judging.getByLabelText("Reason"), { target: { value: "   " } });

    expect(record).toBeDisabled();

    fireEvent.change(judging.getByLabelText("Reason"), { target: { value: "Wrong." } });

    expect(record).toBeEnabled();
  });

  it("says when nobody has judged the run yet", async () => {
    open({ ...ANSWERS, [FEEDBACK_PATH]: [200, { items: [] }] });

    expect(
      await within(await judgment()).findByText("Nobody has judged this run yet."),
    ).toBeVisible();
  });

  it("says when its judgments can't be loaded, and still takes one", async () => {
    open({
      ...ANSWERS,
      [FEEDBACK_PATH]: [503, { error: { code: "unavailable", message: "Down." } }],
    });

    expect(
      await within(await judgment()).findByText("Couldn’t load its judgments: Down."),
    ).toBeVisible();
    expect(await form()).toBeVisible();
  });

  it("records a good judgment, then fetches the run and its judgments again", async () => {
    const sent: Sent[] = [];
    openRecording({ [FEEDBACK_PATH]: [201, GOOD_JUDGMENT] }, sent);

    const judging = within(await form());
    const record = judging.getByRole("button", { name: "Record judgment" });

    expect(record).toBeDisabled();
    expect(judging.queryByLabelText("What it should have produced")).toBeNull();

    fireEvent.click(judging.getByRole("radio", { name: "Good" }));
    fireEvent.click(record);

    await waitFor(() => {
      expect(posted(sent)).toEqual([
        { method: "POST", path: FEEDBACK_PATH, body: { disposition: "good" } },
      ]);
    });
    await waitFor(() => {
      expect(sent.filter((request) => request.path === FEEDBACK_PATH)).toHaveLength(3);
    });
    expect(
      sent.filter((request) => request.method === "GET" && request.path === RUN_PATH),
    ).toHaveLength(2);
    await waitFor(() => {
      expect(judging.getByRole("radio", { name: "Good" })).not.toBeChecked();
    });
  });

  it("records a bad judgment with its reason and what it should have produced", async () => {
    const sent: Sent[] = [];
    openRecording({ [FEEDBACK_PATH]: [201, BAD_JUDGMENT] }, sent);

    const judging = within(await form());

    fireEvent.click(judging.getByRole("radio", { name: "Bad" }));
    fireEvent.change(judging.getByLabelText("Reason"), {
      target: { value: "  It left out the fire.  " },
    });
    fireEvent.change(judging.getByLabelText("What it should have produced"), {
      target: { value: '{"text": "Right."}' },
    });
    fireEvent.click(judging.getByRole("button", { name: "Record judgment" }));

    await waitFor(() => {
      expect(posted(sent)).toEqual([
        {
          method: "POST",
          path: FEEDBACK_PATH,
          body: {
            disposition: "bad",
            reason: "It left out the fire.",
            corrected_output: { text: "Right." },
          },
        },
      ]);
    });
    await waitFor(() => {
      expect(judging.getByLabelText("Reason")).toHaveValue("");
    });
  });

  it("sends no corrected output when none is written, and none once it is judged good", async () => {
    const sent: Sent[] = [];
    openRecording({ [FEEDBACK_PATH]: [201, GOOD_JUDGMENT] }, sent);

    const judging = within(await form());

    fireEvent.click(judging.getByRole("radio", { name: "Bad" }));
    fireEvent.change(judging.getByLabelText("What it should have produced"), {
      target: { value: '"Right."' },
    });
    fireEvent.click(judging.getByRole("radio", { name: "Good" }));

    expect(judging.queryByLabelText("What it should have produced")).toBeNull();

    fireEvent.click(judging.getByRole("button", { name: "Record judgment" }));

    await waitFor(() => {
      expect(posted(sent)).toEqual([
        { method: "POST", path: FEEDBACK_PATH, body: { disposition: "good" } },
      ]);
    });
  });

  it("will not send what it should have produced until it reads as JSON", async () => {
    open();

    const judging = within(await form());

    fireEvent.click(judging.getByRole("radio", { name: "Bad" }));
    fireEvent.change(judging.getByLabelText("Reason"), { target: { value: "Wrong." } });
    fireEvent.change(judging.getByLabelText("What it should have produced"), {
      target: { value: "{not json" },
    });

    expect(judging.getByLabelText("What it should have produced")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(judging.getByText(/isn’t JSON yet/)).toBeVisible();
    expect(judging.getByRole("button", { name: "Record judgment" })).toBeDisabled();
  });

  it("shows why Azathoth would not record a judgment", async () => {
    openRecording(
      {
        [FEEDBACK_PATH]: [
          404,
          { error: { code: "not_found", message: "The run is no longer kept." } },
        ],
      },
      [],
    );

    const judging = within(await form());

    fireEvent.click(judging.getByRole("radio", { name: "Bad" }));
    fireEvent.change(judging.getByLabelText("Reason"), { target: { value: "Wrong." } });
    fireEvent.click(judging.getByRole("button", { name: "Record judgment" }));

    expect(await screen.findByText("Couldn't record the judgment")).toBeVisible();
    expect(screen.getByText("The run is no longer kept.")).toBeVisible();
    expect(judging.getByRole("radio", { name: "Bad" })).toBeChecked();
  });

  it("hides a restricted run's judgments with the rest of its data, and shows them with it", async () => {
    open({ ...ANSWERS, [RUN_PATH]: [200, RESTRICTED_RUN] });

    const section = within(await judgment());

    expect(await section.findByRole("group", { name: "Restricted: its judgments" })).toBeVisible();
    expect(section.queryByRole("list", { name: "Judgments" })).toBeNull();

    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Restricted: the run's input, result and steps" }),
      ).getByRole("button", { name: "Show it" }),
    );

    expect(section.getByRole("list", { name: "Judgments" })).toBeVisible();
    expect(screen.getByLabelText("The run's input, as JSON")).toBeVisible();
  });

  it("disables judging where runs may not be annotated, saying why", async () => {
    renderAt(
      <Routes>
        <Route path="/runs/:runId" element={<RunPage />} />
      </Routes>,
      {
        ...page(),
        answers: ANSWERS,
        permissions: (_instance, action) =>
          action === "annotate_run"
            ? { allowed: false, reason: "Only reviewers judge runs." }
            : { allowed: true },
      },
    );

    const judging = within(await form());
    fireEvent.click(judging.getByRole("radio", { name: "Good" }));
    const record = judging.getByRole("button", { name: "Record judgment" });

    expect(record).toBeDisabled();
    expect(record).toHaveAccessibleDescription("Only reviewers judge runs.");
  });
});

describe("a workflow's runs", () => {
  it("say how each run was last judged, if it was", async () => {
    renderAt(<RunHistory workflowId={WORKFLOW.id} />, {
      answers: {
        ...SERVER,
        [`/api/workflows/${WORKFLOW.id}/runs?limit=20`]: [
          200,
          {
            items: [
              { ...RUN_SUMMARY, run_id: "r1", feedback: "bad" },
              { ...RUN_SUMMARY, run_id: "r2", feedback: "good" },
              { ...RUN_SUMMARY, run_id: "r3", feedback: null },
            ],
          },
        ],
      },
    });

    const runs = await screen.findAllByRole("link");
    const [bad, good, none] = runs;

    if (bad === undefined || good === undefined || none === undefined) {
      throw new Error("Three runs were expected.");
    }

    expect(within(bad).getByText("Judged bad")).toHaveAttribute("data-feedback", "bad");
    expect(within(good).getByText("Judged good")).toHaveAttribute("data-feedback", "good");
    expect(none).not.toHaveTextContent("Judged");
  });
});

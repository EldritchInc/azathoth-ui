import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { lastStream, stubEventSource } from "../test/eventSource";
import { answering, SERVER, serving, urlOf } from "../test/instances";
import { VALID_DOCUMENT } from "../test/documents";
import { renderAt } from "../test/render";
import { SELECT, SUMMARIZE, TRIED, TRYING } from "../test/runs";
import { TryStep } from "./TryStep";

/** Renders one step's try, with a server that starts every try, keeping what each sent. */
function open(id: string, { blocked = false, refuse = false } = {}) {
  const sent: unknown[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const path = urlOf(input).pathname;

    if (path === "/api/live/steps" && typeof init?.body === "string") {
      sent.push(JSON.parse(init.body));

      return refuse
        ? answering(429, { error: { code: "too_many_runs", message: "4 runs are running." } })(
            input,
          )
        : answering(201, TRYING)(input);
    }
    if (path === `/api/live/${TRYING.handle}/cancel`) {
      return answering(200, { ...TRYING, state: "cancelled" })(input);
    }
    return serving(SERVER)(input);
  };

  renderAt(<TryStep document={VALID_DOCUMENT} id={id} title="the step" blocked={blocked} />, {
    fetcher,
  });
  return sent;
}

function tryIt() {
  fireEvent.click(screen.getByRole("button", { name: "Try it" }));
}

describe("TryStep", () => {
  beforeEach(() => {
    stubEventSource();
  });

  it("leaves a step's inputs as written where it may, and asks for the run's input they read", () => {
    open(SELECT);

    const value = screen.getByRole("radiogroup", { name: "Give value" });

    expect(within(value).getByRole("radio", { name: "As written" })).toBeChecked();
    expect(screen.getByText("It reads the workflow's input, as written.")).toBeVisible();
    expect(
      within(screen.getByRole("radiogroup", { name: "Give path" })).getByRole("radio", {
        name: "As written",
      }),
    ).toBeChecked();
    expect(screen.getByLabelText("The run's input, as text")).toBeVisible();

    fireEvent.click(within(value).getByRole("radio", { name: "Text" }));

    expect(screen.getByLabelText("value, as text")).toBeVisible();
    expect(screen.queryByLabelText("The run's input, as text")).toBeNull();
  });

  it("asks for an input another step gives, as no step gives it here", () => {
    open(SUMMARIZE);

    const ticket = screen.getByRole("radiogroup", { name: "Give ticket" });

    expect(within(ticket).queryByRole("radio", { name: "As written" })).toBeNull();
    expect(within(ticket).getByRole("radio", { name: "Text" })).toBeChecked();
    expect(screen.queryByLabelText("The run's input, as text")).toBeNull();
  });

  it("tries the step on what it is given, and shows it as it runs and once it has", async () => {
    const sent = open(SELECT);

    fireEvent.change(screen.getByLabelText("The run's input, as text"), {
      target: { value: "A ticket." },
    });
    tryIt();

    expect(await screen.findByRole("region", { name: "Trying the step" })).toHaveTextContent(
      "Waiting",
    );
    expect(sent).toEqual([
      {
        document: VALID_DOCUMENT,
        step_id: SELECT,
        inputs: {},
        files: {},
        input: "A ticket.",
      },
    ]);
    expect(lastStream().url).toBe(`/api/live/${TRYING.handle}/events`);

    act(() => {
      lastStream().emit(
        "run_event",
        { type: "step_started", step_id: SELECT, layer: 0, message: null },
        "1",
      );
    });

    expect(screen.getByRole("region", { name: "Trying the step" })).toHaveTextContent("Running");

    act(() => {
      lastStream().emit("end", TRIED);
    });

    const tried = screen.getByRole("region", { name: "the step as tried" });

    expect(tried).toHaveTextContent("Done");
    expect(within(tried).getByLabelText("What the step returned, as JSON")).toHaveTextContent(
      "A ticket.",
    );
    expect(screen.getByRole("link", { name: "Open its page" })).toHaveAttribute(
      "href",
      `/live/${TRYING.handle}`,
    );
  });

  it("cancels a try that is running", async () => {
    open(SELECT);

    tryIt();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    act(() => {
      lastStream().emit("end", { ...TRYING, state: "cancelled" });
    });

    expect(await screen.findByText("The try was cancelled")).toBeVisible();
  });

  it("says why Azathoth refused to try it", async () => {
    open(SELECT);

    tryIt();
    await screen.findByRole("region", { name: "Trying the step" });

    act(() => {
      lastStream().emit("end", {
        ...TRYING,
        state: "refused",
        error: { code: "run_not_started", message: "No model meets this step's needs." },
      });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Azathoth refused to try it");
    expect(screen.getByRole("alert")).toHaveTextContent("No model meets this step's needs.");
  });

  it("says why a try didn't start", async () => {
    open(SELECT, { refuse: true });

    tryIt();

    expect(await screen.findByRole("alert")).toHaveTextContent("4 runs are running.");
  });

  it("won't try a step until it is given what it needs, or while Azathoth would refuse it", () => {
    open(SELECT);

    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Give value" })).getByRole("radio", {
        name: "JSON",
      }),
    );

    expect(screen.getByRole("button", { name: "Try it" })).toBeDisabled();
    expect(screen.getByText(/^“value”: Write the input as JSON/)).toBeVisible();
  });

  it("won't try a step Azathoth would refuse", () => {
    open(SELECT, { blocked: true });

    expect(screen.getByRole("button", { name: "Try it" })).toBeDisabled();
    expect(screen.getByText("Fix what Azathoth would refuse in this step first.")).toBeVisible();
  });
});

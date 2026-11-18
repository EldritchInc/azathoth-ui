import { describe, expect, it } from "vitest";

import { callerName, invocationOutcomeOf } from "./invocations";
import { instanceLabel, LOCAL_SCOPE } from "./scope";
import { LIVE_INVOCATION, OUTCOME } from "./test/production";
import { LIVE_RUN } from "./test/runs";

describe("callerName", () => {
  it("names the editor as the editor", () => {
    expect(callerName({ client: "azathoth-ui" })).toBe("The editor");
  });

  it("says what any other caller said of itself", () => {
    expect(callerName({ user: "billing-agent", attempt: 2 })).toBe("user=billing-agent, attempt=2");
  });

  it("says when no caller was named", () => {
    expect(callerName({})).toBe("No caller named");
  });
});

describe("invocationOutcomeOf", () => {
  it("reads an invocation's outcome once it has ended", () => {
    expect(
      invocationOutcomeOf({ ...LIVE_INVOCATION, state: "finished", result: { ...OUTCOME } }),
    ).toEqual(OUTCOME);
  });

  it("reads none from a run, or from an invocation still running", () => {
    expect(invocationOutcomeOf({ ...LIVE_RUN, state: "finished", result: { ...OUTCOME } })).toBe(
      null,
    );
    expect(invocationOutcomeOf(LIVE_INVOCATION)).toBeNull();
  });
});

describe("instanceLabel", () => {
  it("calls the local instance yours, and a remote by its name", () => {
    expect(instanceLabel(LOCAL_SCOPE.name)).toBe("your local instance");
    expect(instanceLabel("staging")).toBe("staging");
  });
});

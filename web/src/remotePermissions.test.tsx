import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiFailure, type PermissionsAsker } from "./api/client";
import type { ActionPermission, PermissionsAnswer } from "./api/types";
import { ActionButton } from "./components/ActionButton";
import { ACTIONS, resource, type Action, type Resource } from "./permissions";
import { PermissionsProvider } from "./components/PermissionsProvider";
import { MAX_RESOURCES, PERMISSIONS_TTL, RemotePermissions } from "./remotePermissions";
import { LOCAL_SCOPE, remoteScope } from "./scope";
import { SERVER, WORKFLOW } from "./test/instances";
import { recording, type Sent } from "./test/remotes";
import { renderAt } from "./test/render";

const ORIGIN = remoteScope("origin");

const STAGING = remoteScope("staging");

const REFUSED = "eris may not promote here; only release managers may.";

/** Every action allowed but `promote`, refused with a reason, and `optimize`, without one. */
function actions(): ActionPermission[] {
  return ACTIONS.map((action) => {
    if (action === "promote") {
      return { action, allowed: false, reason: REFUSED };
    }

    if (action === "optimize") {
      return { action, allowed: false, reason: null };
    }

    return { action, allowed: true, reason: null };
  });
}

/** One question a store asked: of which remote, and of which resources, or of the whole remote. */
interface Question {
  readonly api: string;
  readonly resources: readonly Resource[] | null;
}

/** A remote that answers every question with `actions()`, keeping each question, until it fails. */
class Answering {
  readonly asked: Question[] = [];
  failure: ApiFailure | null = null;

  readonly ask: PermissionsAsker = (resources, options) => {
    this.asked.push({ api: options.base ?? "", resources });

    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }

    const answer: PermissionsAnswer =
      resources === null
        ? { principal: "eris", actions: actions() }
        : {
            principal: "eris",
            resources: resources.map((each) => ({ resource: each, actions: actions() })),
          };

    return Promise.resolve(answer);
  };
}

/** A clock a test moves by hand. */
class Clock {
  at = 1_000_000;

  readonly now = () => this.at;
}

/** Lets every question asked so far be answered. */
async function answered(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await Promise.resolve();
  }
}

function store(remote = new Answering(), clock = new Clock()) {
  return { permissions: new RemotePermissions(remote.ask, clock.now), remote, clock };
}

const WORKFLOW_RESOURCE = resource("workflow", WORKFLOW.id);

describe("resource", () => {
  it("names a resource as a remote's policy does: its kind, then its ID", () => {
    expect(resource("workflow", "w1")).toBe("workflow w1");
    expect(resource("model", "openrouter/acme/large")).toBe("model openrouter/acme/large");
  });
});

describe("RemotePermissions", () => {
  it("allows everything on the editor's own instance, asking nothing", async () => {
    const { permissions, remote } = store();

    for (const action of ACTIONS) {
      expect(permissions.allowance(LOCAL_SCOPE, action, WORKFLOW_RESOURCE)).toEqual({
        allowed: true,
      });
    }

    await answered();

    expect(remote.asked).toEqual([]);
  });

  it("asks a remote once, and answers in its policy's words once it has", async () => {
    const { permissions, remote } = store();

    expect(permissions.allowance(ORIGIN, "promote", null)).toEqual({
      allowed: false,
      reason: "Asking origin what you may do.",
    });
    expect(permissions.allowance(ORIGIN, "run_workflow", null).allowed).toBe(false);

    await answered();

    expect(remote.asked).toEqual([{ api: ORIGIN.api, resources: null }]);
    expect(permissions.allowance(ORIGIN, "run_workflow", null)).toEqual({ allowed: true });
    expect(permissions.allowance(ORIGIN, "promote", null)).toEqual({
      allowed: false,
      reason: REFUSED,
    });
    expect(permissions.allowance(ORIGIN, "optimize", null)).toEqual({
      allowed: false,
      reason: "origin's policy doesn't let you optimize.",
    });
  });

  it("asks of every resource a page names in one request", async () => {
    const { permissions, remote } = store();
    const named: Resource[] = [
      WORKFLOW_RESOURCE,
      resource("benchmark", "b1"),
      resource("model", "openrouter/acme/large"),
    ];

    for (const each of [...named, ...named]) {
      permissions.allowance(ORIGIN, "promote", each);
      permissions.allowance(ORIGIN, "run_workflow", each);
    }

    await answered();

    expect(remote.asked).toEqual([{ api: ORIGIN.api, resources: named }]);
    expect(permissions.allowance(ORIGIN, "run_workflow", named[1] ?? null)).toEqual({
      allowed: true,
    });
    expect(permissions.allowance(ORIGIN, "promote", WORKFLOW_RESOURCE)).toEqual({
      allowed: false,
      reason: REFUSED,
    });
  });

  it("asks of no more resources at once than a remote answers about", async () => {
    const { permissions, remote } = store();
    const count = MAX_RESOURCES + 20;

    for (let index = 0; index < count; index += 1) {
      permissions.allowance(ORIGIN, "run_workflow", resource("run", `r${String(index)}`));
    }

    await answered();

    expect(MAX_RESOURCES).toBe(100);
    expect(remote.asked.map((each) => each.resources?.length)).toEqual([MAX_RESOURCES, 20]);
  });

  it("asks each remote of its own, and never takes a remote named local for this one", async () => {
    const { permissions, remote } = store();

    permissions.allowance(ORIGIN, "push", null);
    permissions.allowance(STAGING, "push", null);
    permissions.allowance(remoteScope("local"), "push", null);

    await answered();

    expect(remote.asked.map((each) => each.api)).toEqual([
      ORIGIN.api,
      STAGING.api,
      remoteScope("local").api,
    ]);
  });

  it("says why it couldn't ask, and asks again once its answer is old", async () => {
    const { permissions, remote, clock } = store();
    remote.failure = new ApiFailure(
      "remote_unreachable",
      "The remote at https://azathoth.example.com could not be reached: Connection refused",
      502,
    );

    permissions.allowance(ORIGIN, "push", null);
    await answered();

    expect(permissions.allowance(ORIGIN, "push", null)).toEqual({
      allowed: false,
      reason:
        "Couldn't ask origin what you may do: The remote at https://azathoth.example.com " +
        "could not be reached: Connection refused",
    });
    expect(remote.asked).toHaveLength(1);

    remote.failure = null;
    clock.at += PERMISSIONS_TTL + 1;
    permissions.allowance(ORIGIN, "push", null);
    await answered();

    expect(remote.asked).toHaveLength(2);
    expect(permissions.allowance(ORIGIN, "push", null)).toEqual({ allowed: true });
  });

  it("keeps an answer briefly, and shows it while it asks again", async () => {
    const { permissions, remote, clock } = store();

    permissions.allowance(ORIGIN, "promote", null);
    await answered();
    clock.at += PERMISSIONS_TTL - 1;
    permissions.allowance(ORIGIN, "promote", null);
    await answered();

    expect(remote.asked).toHaveLength(1);

    clock.at += 2;

    expect(permissions.allowance(ORIGIN, "promote", null)).toEqual({
      allowed: false,
      reason: REFUSED,
    });

    await answered();

    expect(remote.asked).toHaveLength(2);
  });

  it("asks again of a remote it is told to forget, and of no other", async () => {
    const { permissions, remote } = store();

    permissions.allowance(ORIGIN, "push", null);
    permissions.allowance(STAGING, "push", WORKFLOW_RESOURCE);
    await answered();
    permissions.forget(ORIGIN);
    permissions.allowance(ORIGIN, "push", null);
    permissions.allowance(STAGING, "push", WORKFLOW_RESOURCE);
    await answered();

    expect(remote.asked.map((each) => each.api)).toEqual([ORIGIN.api, STAGING.api, ORIGIN.api]);
  });

  it("tells whoever listens once an answer arrives", async () => {
    const { permissions } = store();
    let told = 0;
    const before = permissions.current();
    const stop = permissions.subscribe(() => {
      told += 1;
    });

    permissions.allowance(ORIGIN, "push", null);
    await answered();
    stop();

    expect(told).toBeGreaterThan(0);
    expect(permissions.current()).not.toBe(before);
  });

  it("refuses an action a remote's answer doesn't name, saying so", async () => {
    const remote = new Answering();
    const ask: PermissionsAsker = (resources, options) =>
      remote
        .ask(resources, options)
        .then((answer) =>
          "actions" in answer
            ? { ...answer, actions: answer.actions.filter((each) => each.action !== "push") }
            : answer,
        );
    const permissions = new RemotePermissions(ask, new Clock().now);

    permissions.allowance(ORIGIN, "push", null);
    await answered();

    expect(permissions.allowance(ORIGIN, "push" satisfies Action, null)).toEqual({
      allowed: false,
      reason: "origin doesn't say whether you may push.",
    });
  });
});

describe("PermissionsProvider", () => {
  it("asks of every button's resource in one request, then gates each", async () => {
    const sent: Sent[] = [];
    const told = (resources: readonly string[]) => ({
      principal: "eris",
      resources: resources.map((each) => ({ resource: each, actions: actions() })),
    });
    const fetcher = recording(
      SERVER,
      {
        [`${ORIGIN.api}/permissions`]: [
          200,
          told([WORKFLOW_RESOURCE, resource("benchmark", "b1")]),
        ],
      },
      sent,
    );

    renderAt(
      <PermissionsProvider>
        <ActionButton type="button" action="promote" subject={WORKFLOW_RESOURCE}>
          Promote
        </ActionButton>
        <ActionButton type="button" action="run_benchmark" subject={resource("benchmark", "b1")}>
          Run
        </ActionButton>
      </PermissionsProvider>,
      { scope: ORIGIN, fetcher },
    );

    const promote = screen.getByRole("button", { name: "Promote" });

    expect(promote).toBeDisabled();
    expect(promote).toHaveAccessibleDescription("Asking origin what you may do.");

    await waitFor(() => {
      expect(promote).toHaveAccessibleDescription(REFUSED);
    });
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    expect(sent.filter((each) => each.path === `${ORIGIN.api}/permissions`)).toEqual([
      {
        method: "POST",
        path: `${ORIGIN.api}/permissions`,
        body: { resources: [WORKFLOW_RESOURCE, "benchmark b1"] },
      },
    ]);
  });

  it("asks nothing on the editor's own instance", async () => {
    const sent: Sent[] = [];

    renderAt(
      <PermissionsProvider>
        <ActionButton type="button" action="promote" subject={WORKFLOW_RESOURCE}>
          Promote
        </ActionButton>
      </PermissionsProvider>,
      { fetcher: recording(SERVER, {}, sent) },
    );

    expect(screen.getByRole("button", { name: "Promote" })).toBeEnabled();

    await act(answered);

    expect(sent.filter((each) => each.path.endsWith("/permissions"))).toEqual([]);
  });
});

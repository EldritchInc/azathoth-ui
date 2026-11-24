import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiFailure } from "../api/client";
import type { ServiceDescription } from "../api/types";
import { remoteScope } from "../scope";
import { ORIGIN_ANSWERS, ORIGIN_INSTANCE, ORIGIN_SERVICE } from "../test/remotes";
import { renderAt } from "../test/render";
import type { Connection } from "../useInstance";
import { RemoteInstance } from "./RemoteInstance";

const ORIGIN = remoteScope("origin");

const CONNECTED: Connection = { state: "connected", instance: ORIGIN_INSTANCE };

function serving(service: ServiceDescription) {
  return { ...ORIGIN_ANSWERS, "/api/remotes/origin/service": [200, service] } as const;
}

function there(): HTMLElement {
  return screen.getByRole("region", { name: "The instance there" });
}

describe("RemoteInstance", () => {
  it("describes the instance the remote serves, and the edition its policy names", async () => {
    renderAt(<RemoteInstance connection={CONNECTED} />, {
      scope: ORIGIN,
      answers: ORIGIN_ANSWERS,
    });

    expect(await within(there()).findByText("studio")).toBeVisible();
    expect(within(there()).getByText(ORIGIN_SERVICE.edition_detail ?? "")).toBeVisible();
    expect(within(there()).getByText(ORIGIN_INSTANCE.database)).toBeVisible();
    expect(within(there()).getByText("PostgreSQL")).toBeVisible();
    expect(within(there()).getByText("1.6.0b1")).toBeVisible();
    expect(within(there()).getByText("Version 3")).toBeVisible();
  });

  it("says how its jobs stand: how many wait and run, and its runners alive", async () => {
    renderAt(<RemoteInstance connection={CONNECTED} />, {
      scope: ORIGIN,
      answers: ORIGIN_ANSWERS,
    });

    expect(await within(there()).findByText("2 waiting, 1 running")).toBeVisible();
    expect(within(there()).getByText("3 runners alive")).toBeVisible();
    expect(within(there()).getByText(/the oldest submitted/)).toBeVisible();
  });

  it("says when what waits has no runner alive to start it", async () => {
    renderAt(<RemoteInstance connection={CONNECTED} />, {
      scope: ORIGIN,
      answers: serving({
        ...ORIGIN_SERVICE,
        jobs: { queued: 1, running: 0, runners: 0, oldest_queued_at: "2026-11-24T09:00:00Z" },
      }),
    });

    expect(await within(there()).findByText("No runner is alive")).toBeVisible();
    expect(
      within(there()).getByText(/nothing waiting starts until one runs/, { exact: false }),
    ).toBeVisible();
  });

  it("says when the remote runs no jobs, and no more of its edition than it gives", async () => {
    renderAt(<RemoteInstance connection={CONNECTED} />, {
      scope: ORIGIN,
      answers: serving({ ...ORIGIN_SERVICE, edition: "core", edition_detail: null, jobs: null }),
    });

    expect(await within(there()).findByText("core")).toBeVisible();
    expect(within(there()).getByText("It runs no jobs.")).toBeVisible();
    expect(within(there()).queryByText(/Licensed/)).toBeNull();
  });

  it("passes on why the remote couldn't say what it serves", async () => {
    renderAt(<RemoteInstance connection={CONNECTED} />, {
      scope: ORIGIN,
      answers: {
        ...ORIGIN_ANSWERS,
        "/api/remotes/origin/service": [
          403,
          { error: { code: "permission_denied", message: "eris may not read capabilities." } },
        ],
      },
    });

    expect(await within(there()).findByText("eris may not read capabilities.")).toBeVisible();
    expect(within(there()).getByText(ORIGIN_INSTANCE.database)).toBeVisible();
  });

  it("passes on why the instance there couldn't be reached", async () => {
    const failure = new ApiFailure(
      "remote_unreachable",
      "The remote at https://azathoth.example.com could not be reached: Connection refused",
      502,
    );

    renderAt(<RemoteInstance connection={{ state: "lost", failure, instance: null }} />, {
      scope: ORIGIN,
      answers: ORIGIN_ANSWERS,
    });

    expect(await within(there()).findByText(failure.message)).toBeVisible();
  });
});

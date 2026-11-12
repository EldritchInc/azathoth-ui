import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiFailure } from "../api/client";
import type { InstanceDescription } from "../api/types";
import { SQLITE_INSTANCE } from "../test/instances";
import { instanceName } from "../instanceName";
import { Overview } from "./Overview";

const POSTGRES_INSTANCE: InstanceDescription = {
  ...SQLITE_INSTANCE,
  database: "postgresql://db.example.com:5432/azathoth",
  backend: "postgres",
};

function detail(name: string): HTMLElement {
  const term = screen.getByText(name, { selector: "dt" });
  const value = term.nextElementSibling;

  if (!(value instanceof HTMLElement)) {
    throw new Error(`no value for ${name}`);
  }
  return value;
}

describe("instanceName", () => {
  it("names an SQLite instance by its file", () => {
    expect(instanceName(SQLITE_INSTANCE)).toBe("ui.db");
    expect(instanceName({ ...SQLITE_INSTANCE, database: "C:\\Users\\eris\\work.db" })).toBe(
      "work.db",
    );
  });

  it("names a PostgreSQL instance by its database", () => {
    expect(instanceName(POSTGRES_INSTANCE)).toBe("azathoth");
    expect(instanceName({ ...POSTGRES_INSTANCE, database: "postgresql://db.example.com" })).toBe(
      "db.example.com",
    );
    expect(instanceName({ ...POSTGRES_INSTANCE, database: "not a url" })).toBe(
      "PostgreSQL instance",
    );
  });
});

describe("Overview", () => {
  it("says it is connecting before the first answer", () => {
    render(<Overview connection={{ state: "connecting" }} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Connecting");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the instance it is connected to", () => {
    render(<Overview connection={{ state: "connected", instance: SQLITE_INSTANCE }} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ui.db");
    expect(screen.getByText("An SQLite instance, served by Azathoth 1.4.0.")).toBeVisible();
    expect(detail("Location")).toHaveTextContent(SQLITE_INSTANCE.database);
    expect(detail("Backend")).toHaveTextContent("SQLite");
    expect(detail("Azathoth")).toHaveTextContent("1.4.0");
    expect(detail("Schema")).toHaveTextContent("Version 7");
    expect(detail("Service API")).toHaveTextContent(
      "StableIts calls change only in a major release.",
    );
    expect(within(detail("Location")).getByRole("button", { name: "Copy location" })).toBeEnabled();
  });

  it("describes a PostgreSQL instance", () => {
    render(<Overview connection={{ state: "connected", instance: POSTGRES_INSTANCE }} />);

    expect(screen.getByText("A PostgreSQL instance, served by Azathoth 1.4.0.")).toBeVisible();
    expect(detail("Backend")).toHaveTextContent("PostgreSQL");
  });

  it("says when an Azathoth's service API is still provisional", () => {
    const provisional: InstanceDescription = {
      ...SQLITE_INSTANCE,
      azathoth_version: "1.5.0a1",
      api_stability: "provisional",
    };
    render(<Overview connection={{ state: "connected", instance: provisional }} />);

    expect(detail("Service API")).toHaveTextContent(
      "ProvisionalIts calls may change in a minor release.",
    );
  });

  it("says how to get back in when the key is from another launch", () => {
    const failure = new ApiFailure(
      "unauthenticated",
      "Open the address azathoth-ui printed when it started.",
      401,
    );
    render(<Overview connection={{ state: "lost", failure, instance: SQLITE_INSTANCE }} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This browser isn't signed in to this launch");
    expect(alert).toHaveTextContent("Open the address azathoth-ui printed in your terminal.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ui.db");
  });

  it("says the server stopped, and keeps showing what it last saw", () => {
    const failure = new ApiFailure("unreachable", "The editor's server isn't answering.", null);
    render(<Overview connection={{ state: "lost", failure, instance: SQLITE_INSTANCE }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("The editor's server isn't answering");
    expect(screen.getByRole("alert")).toHaveTextContent("start it again");
    expect(detail("Backend")).toHaveTextContent("SQLite");
  });

  it("passes on any other problem the server reports", () => {
    const failure = new ApiFailure("instance_closed", "This Azathoth instance is closed.", 503);
    render(<Overview connection={{ state: "lost", failure, instance: null }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("The editor's server reported a problem");
    expect(screen.getByRole("alert")).toHaveTextContent("This Azathoth instance is closed.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("No instance");
  });
});

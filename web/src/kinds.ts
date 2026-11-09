/**
 * The three kinds of component the editor browses, and what it calls each.
 */

import { fetchBenchmarks, fetchTools, fetchWorkflows, type RequestOptions } from "./api/client";
import type { BenchmarkSummary, ToolSummary, WorkflowSummary } from "./api/types";

export type Kind = "workflows" | "tools" | "benchmarks";

export const KINDS: readonly Kind[] = ["workflows", "tools", "benchmarks"];

/** Each kind's summary. */
export interface SummaryOf {
  readonly workflows: WorkflowSummary;
  readonly tools: ToolSummary;
  readonly benchmarks: BenchmarkSummary;
}

/** How the editor names and finds one kind of component. */
export interface KindDescription<K extends Kind> {
  /** The kind's page title and navigation label: "Workflows". */
  readonly title: string;
  /** One of the kind, in a sentence: "workflow". */
  readonly singular: string;
  /** The kind's list, in the web app. */
  readonly path: string;
  /** The command that imports one document of the kind. */
  readonly importCommand: string;
  /** What the kind is for, in the list's lead. */
  readonly lead: string;
  /** Fetches the kind's list. */
  readonly fetch: (options?: RequestOptions) => Promise<SummaryOf[K][]>;
}

export const DESCRIPTIONS: { readonly [K in Kind]: KindDescription<K> } = {
  workflows: {
    title: "Workflows",
    singular: "workflow",
    path: "/workflows",
    importCommand: "azathoth workflow import <file>",
    lead: "Workflows in your local instance, each at its latest revision.",
    fetch: fetchWorkflows,
  },
  tools: {
    title: "Tools",
    singular: "tool",
    path: "/tools",
    importCommand: "azathoth tool import <file>",
    lead: "Tool versions in your local instance, Azathoth's standard tools among them.",
    fetch: fetchTools,
  },
  benchmarks: {
    title: "Benchmarks",
    singular: "benchmark",
    path: "/benchmarks",
    importCommand: "azathoth benchmark import <file>",
    lead: "Benchmarks in your local instance, each at its latest revision.",
    fetch: fetchBenchmarks,
  },
};

/** Returns where the web app shows one component. */
export function detailPath(kind: Kind, summary: { readonly id: string; readonly version: string }) {
  const id = encodeURIComponent(summary.id);

  return kind === "tools"
    ? `/tools/${id}/versions/${encodeURIComponent(summary.version)}`
    : `/${kind}/${id}`;
}

/** Names one component: its id, and for a tool, its version. */
export interface ComponentRef {
  readonly id: string;
  readonly version?: string;
}

function apiBase(kind: Kind, ref: ComponentRef): string {
  return `/api/${kind}/${encodeURIComponent(ref.id)}`;
}

/** Returns where the API serves one revision of a component, the latest when none is named. */
export function detailApiPath(kind: Kind, ref: ComponentRef, revision: number | null): string {
  const path =
    kind === "tools"
      ? `${apiBase(kind, ref)}/versions/${encodeURIComponent(ref.version ?? "")}`
      : apiBase(kind, ref);

  return revision === null ? path : `${path}?revision=${String(revision)}`;
}

/** The most revisions a component's page lists. */
export const HISTORY_LIMIT = 100;

/** Returns where the API serves a component's history: for a tool, of its one version. */
export function historyApiPath(kind: Kind, ref: ComponentRef): string {
  const query = new URLSearchParams({ limit: String(HISTORY_LIMIT) });

  if (kind === "tools") {
    query.set("version", ref.version ?? "");
  }

  return `${apiBase(kind, ref)}/history?${query.toString()}`;
}

/** Returns the revision a page's `?revision=` names, or `null` for the latest or anything else. */
export function parseRevision(text: string | null): number | null {
  return text !== null && /^[1-9][0-9]{0,8}$/.test(text) ? Number(text) : null;
}

/** Returns whether one component matches what the person typed into a list's filter. */
export function matches(
  summary: {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly description: string;
  },
  filter: string,
): boolean {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const text = [summary.name, summary.description, summary.version, summary.id]
    .join(" ")
    .toLowerCase();

  return words.every((word) => text.includes(word));
}

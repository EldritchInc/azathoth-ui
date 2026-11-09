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

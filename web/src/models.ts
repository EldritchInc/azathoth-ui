/**
 * The models the providers serve, as the editor shows them: how each is
 * named and priced, and which a person's filters keep, in what order. The
 * filters live in the page's address, so a link can open the catalog
 * filtered to what a step needs.
 */

import type { ModelSummary } from "./api/types";

/** What a model can read or write, as Azathoth names it, and as the editor says it. */
export const MODALITIES: readonly (readonly [string, string])[] = [
  ["text", "Text"],
  ["image", "Images"],
  ["audio", "Audio"],
  ["video", "Video"],
  ["file", "Files"],
];

/** What a model can do, as Azathoth names it, and as the editor says it. */
export const CAPABILITIES: readonly (readonly [string, string])[] = [
  ["structured_output", "Structured output"],
  ["tool_use", "Tool use"],
  ["vision", "Vision"],
  ["streaming", "Streaming"],
];

/** The orders the catalog can be in. */
export type Sort = "name" | "input" | "output" | "context";

export const SORTS: readonly (readonly [Sort, string])[] = [
  ["name", "Name"],
  ["input", "Input price, lowest first"],
  ["output", "Output price, lowest first"],
  ["context", "Context, largest first"],
];

/** Which models a person wants to see, and in what order. */
export interface ModelFilter {
  /** Words every model shown has in its name or identifier. */
  readonly text: string;
  readonly provider: string | null;
  /** What each model shown reads, every one of them. */
  readonly reads: readonly string[];
  /** What each model shown can do, every one of them. */
  readonly can: readonly string[];
  /** The least context window, in tokens; a model whose window is unknown is not shown. */
  readonly context: number | null;
  /** The most a million input tokens may cost, in dollars; unknown prices are not shown. */
  readonly inputPrice: number | null;
  /** The most a million output tokens may cost, in dollars; unknown prices are not shown. */
  readonly outputPrice: number | null;
  /** Only the models the local portfolio holds. */
  readonly mine: boolean;
  readonly sort: Sort;
}

export const NO_FILTER: ModelFilter = {
  text: "",
  provider: null,
  reads: [],
  can: [],
  context: null,
  inputPrice: null,
  outputPrice: null,
  mine: false,
  sort: "name",
};

function amount(text: string | null): number | null {
  if (text === null || text.trim() === "") {
    return null;
  }

  const value = Number(text);

  return Number.isFinite(value) && value >= 0 ? value : null;
}

function known(values: readonly string[], allowed: readonly (readonly [string, string])[]) {
  return [...new Set(values)].filter((value) => allowed.some(([each]) => each === value));
}

/** Returns the filter a page's address holds; what it cannot read is left out. */
export function filterOf(params: URLSearchParams): ModelFilter {
  const sort = SORTS.find(([each]) => each === params.get("sort"))?.[0] ?? "name";
  const provider = params.get("provider");

  return {
    text: params.get("q") ?? "",
    provider: provider === null || provider === "" ? null : provider,
    reads: known(params.getAll("reads"), MODALITIES),
    can: known(params.getAll("can"), CAPABILITIES),
    context: amount(params.get("context")),
    inputPrice: amount(params.get("input")),
    outputPrice: amount(params.get("output")),
    mine: params.get("mine") === "1",
    sort,
  };
}

/** Returns a filter as a page's address holds it, leaving out what is as it is by default. */
export function searchOf(filter: ModelFilter): URLSearchParams {
  const params = new URLSearchParams();

  if (filter.text !== "") {
    params.set("q", filter.text);
  }
  if (filter.provider !== null) {
    params.set("provider", filter.provider);
  }
  for (const modality of filter.reads) {
    params.append("reads", modality);
  }
  for (const capability of filter.can) {
    params.append("can", capability);
  }
  if (filter.context !== null) {
    params.set("context", String(filter.context));
  }
  if (filter.inputPrice !== null) {
    params.set("input", String(filter.inputPrice));
  }
  if (filter.outputPrice !== null) {
    params.set("output", String(filter.outputPrice));
  }
  if (filter.mine) {
    params.set("mine", "1");
  }
  if (filter.sort !== "name") {
    params.set("sort", filter.sort);
  }
  return params;
}

/** Returns whether a filter narrows the catalog at all, its order aside. */
export function narrows(filter: ModelFilter): boolean {
  return searchOf({ ...filter, sort: "name" }).toString() !== "";
}

/** Returns what the editor calls a model: its name, or its provider's name for it. */
export function nameOf(model: ModelSummary): string {
  return model.display_name ?? model.model;
}

function atMost(value: number | null, most: number | null): boolean {
  return most === null || (value !== null && value <= most);
}

/** Returns whether a filter keeps a model. */
export function keeps(filter: ModelFilter, model: ModelSummary): boolean {
  const haystack = `${nameOf(model)} ${model.identifier}`.toLowerCase();
  const words = filter.text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");

  return (
    words.every((word) => haystack.includes(word)) &&
    (filter.provider === null || model.provider === filter.provider) &&
    filter.reads.every((modality) => model.input_modalities.includes(modality)) &&
    filter.can.every((capability) => model.capabilities.includes(capability)) &&
    (filter.context === null ||
      (model.context_window_tokens !== null && model.context_window_tokens >= filter.context)) &&
    atMost(model.input_usd_per_million_tokens, filter.inputPrice) &&
    atMost(model.output_usd_per_million_tokens, filter.outputPrice) &&
    (!filter.mine || model.authorized)
  );
}

/** Returns `a` before `b` by number, lowest or highest first, unknowns last either way. */
function byNumber(a: number | null, b: number | null, highest: boolean): number {
  if (a === null || b === null) {
    return a === b ? 0 : a === null ? 1 : -1;
  }
  return highest ? b - a : a - b;
}

function byName(a: ModelSummary, b: ModelSummary): number {
  return (
    nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base" }) ||
    a.identifier.localeCompare(b.identifier)
  );
}

/** Returns the models a filter keeps, in its order; ties go by name. */
export function shownModels(models: readonly ModelSummary[], filter: ModelFilter): ModelSummary[] {
  const order = (a: ModelSummary, b: ModelSummary): number => {
    switch (filter.sort) {
      case "name":
        return 0;
      case "input":
        return byNumber(a.input_usd_per_million_tokens, b.input_usd_per_million_tokens, false);
      case "output":
        return byNumber(a.output_usd_per_million_tokens, b.output_usd_per_million_tokens, false);
      case "context":
        return byNumber(a.context_window_tokens, b.context_window_tokens, true);
    }
  };

  return models.filter((model) => keeps(filter, model)).sort((a, b) => order(a, b) || byName(a, b));
}

/** Returns the providers models come from, each once, by name. */
export function providersOf(models: readonly ModelSummary[]): string[] {
  return [...new Set(models.map((model) => model.provider))].sort();
}

function trimmed(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}

/** Returns a count of tokens as people say it: 8,192, 33K, 200K, 1.05M; or unknown. */
export function formatTokens(tokens: number | null): string {
  if (tokens === null) {
    return "unknown";
  }
  if (tokens >= 1_000_000) {
    return `${trimmed(tokens / 1_000_000, 2)}M`;
  }
  if (tokens >= 10_000) {
    return `${String(Math.round(tokens / 1000))}K`;
  }
  return tokens.toLocaleString("en-US");
}

const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Returns what a million tokens cost, in dollars: $3.00, $0.075, free; or unknown. */
export function formatPrice(usd: number | null): string {
  if (usd === null) {
    return "unknown";
  }
  return usd === 0 ? "free" : DOLLARS.format(usd);
}

/** Returns what Azathoth names a modality or capability, as the editor says it. */
export function labelOf(name: string): string {
  return (
    [...MODALITIES, ...CAPABILITIES].find(([each]) => each === name)?.[1] ??
    name.replaceAll("_", " ")
  );
}

/** Returns a model's page in the web app: its identifier's parts, each encoded. */
export function modelPath(identifier: string): string {
  return `/models/${identifier.split("/").map(encodeURIComponent).join("/")}`;
}

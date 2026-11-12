/**
 * How the editor shows a remote's status: each component's relation in
 * words, the components grouped by it, and where each one is shown here.
 */

import type { Selection } from "./api/client";
import type { ComponentStatus, Lineage, NamedRemote, Relation, Shell } from "./api/types";
import type { ComponentRef, Kind } from "./kinds";

/** What each relation says, and what it means for the person: a push, a pull, or a choice. */
export const RELATION_TEXT: Readonly<Record<Relation, { label: string; meaning: string }>> = {
  diverged: {
    label: "Diverged",
    meaning: "Both sides changed it since they last agreed. Pull to keep both, then choose.",
  },
  ahead: { label: "Ahead here", meaning: "This instance holds revisions the remote lacks. Push." },
  behind: {
    label: "Behind here",
    meaning: "The remote holds revisions this instance lacks. Pull.",
  },
  local_only: { label: "Only here", meaning: "The remote holds none of it. Push to share it." },
  remote_only: { label: "Only there", meaning: "This instance holds none of it. Pull to get it." },
  in_sync: { label: "In sync", meaning: "Both sides hold the same latest revision." },
};

/** The order relations are shown in: what needs a person first, what agrees last. */
export const RELATION_ORDER: readonly Relation[] = [
  "diverged",
  "ahead",
  "behind",
  "local_only",
  "remote_only",
  "in_sync",
];

/** The components of one relation, or of none when the remote was not reached. */
export interface RelationGroup {
  readonly relation: Relation | null;
  readonly components: readonly ComponentStatus[];
}

/**
 * Returns the components grouped by relation, in `RELATION_ORDER`, each
 * group in the order the status gave, and those whose relation is unknown
 * last. A relation no component has has no group.
 */
export function groupByRelation(components: readonly ComponentStatus[]): RelationGroup[] {
  const groups: RelationGroup[] = RELATION_ORDER.map((relation) => ({
    relation,
    components: components.filter((component) => component.relation === relation),
  }));
  const unknown = components.filter((component) => component.relation === null);

  return [...groups, { relation: null, components: unknown }].filter(
    (group) => group.components.length > 0,
  );
}

/** How many characters of a revision digest the editor shows; its title holds all of it. */
export const SHORT_DIGEST_LENGTH = 12;

/** Returns the start of a revision digest, as the editor shows it. */
export function shortDigest(digest: string): string {
  return digest.slice(0, SHORT_DIGEST_LENGTH);
}

/** Returns where the editor shows a lineage's component, or `null` when this instance holds none. */
export function lineagePath(lineage: Lineage, heldHere: boolean): string | null {
  if (!heldHere) {
    return null;
  }

  const id = encodeURIComponent(lineage.id);

  switch (lineage.kind) {
    case "workflow":
      return `/workflows/${id}`;
    case "benchmark":
      return `/benchmarks/${id}`;
    case "tool":
      return `/tools/${id}/versions/${encodeURIComponent(lineage.version ?? "")}`;
  }
}

/** Returns a key that names one lineage among others: its kind, id and version. */
export function lineageKey(lineage: Lineage): string {
  return `${lineage.kind}:${lineage.id}@${lineage.version ?? ""}`;
}

/** Returns the line that sets a token's variable in the shell the editor writes commands for. */
export function tokenCommand(variable: string, shell: Shell): string {
  return shell === "powershell" ? `$env:${variable} = "<TOKEN>"` : `export ${variable}=<TOKEN>`;
}

/** Returns what a status, push or pull of one component names: its id, and a tool's version. */
export function selectionOf(kind: Kind, ref: ComponentRef): Selection {
  switch (kind) {
    case "workflows":
      return { workflows: [ref.id] };
    case "tools":
      return { tools: [{ id: ref.id, version: ref.version ?? "" }] };
    case "benchmarks":
      return { benchmarks: [ref.id] };
  }
}

/** Returns a lineage in words: what this instance calls it, or its id, and a tool's version. */
export function lineageLabel(lineage: Lineage, name: string | null): string {
  const label = name ?? lineage.id;

  return lineage.version === null ? label : `${label} ${lineage.version}`;
}

/** Returns the remote Ship starts on: the first whose token is set, or else the first. */
export function firstRemote(remotes: readonly NamedRemote[]): NamedRemote | undefined {
  return remotes.find((remote) => remote.token_set) ?? remotes[0];
}

/** The relations a pull changes something for: the remote holds revisions this instance lacks. */
export const PULLABLE: ReadonlySet<Relation> = new Set(["behind", "remote_only", "diverged"]);

/** Returns what a pull of some lineages names: workflows and benchmarks by id, tools with versions. */
export function selectionFor(lineages: readonly Lineage[]): Selection {
  const workflows = lineages.filter((each) => each.kind === "workflow").map((each) => each.id);
  const benchmarks = lineages.filter((each) => each.kind === "benchmark").map((each) => each.id);
  const tools = lineages
    .filter((each) => each.kind === "tool")
    .map((each) => ({ id: each.id, version: each.version ?? "" }));

  return {
    ...(workflows.length > 0 && { workflows }),
    ...(tools.length > 0 && { tools }),
    ...(benchmarks.length > 0 && { benchmarks }),
  };
}

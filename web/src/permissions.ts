/**
 * What the person may do on each instance (ADRs 0009 and 0016).
 *
 * Every button that changes something names the action of Azathoth's ADR
 * 0127 catalog that it takes, and what it acts on as a remote's policy names
 * it, and asks `useAllowed` whether it may. The answer is allowed, or not,
 * with the reason the button shows as it disables itself. On the editor's
 * own instance the answer is always allowed; on a remote, it is what the
 * remote's policy says at its `/v1/permissions`, asked by
 * `PermissionsProvider`.
 */

import { createContext, useContext } from "react";

import { remoteScope, useScope, type InstanceScope } from "./scope";

/** Every action a remote's policy decides, as Azathoth's ADR 0127 names them. */
export const ACTIONS = [
  "read_capabilities",
  "push",
  "pull",
  "read_content",
  "read_portfolio",
  "read_catalog",
  "read_runs",
  "read_restricted",
  "import_workflow",
  "import_benchmark",
  "import_tool",
  "import_process_tool",
  "import_goal",
  "tool_from_mcp",
  "install_standard_tools",
  "run_workflow",
  "invoke",
  "promote",
  "authorize_model",
  "declare_policy",
  "manage_judges",
  "annotate_run",
  "edit_benchmark",
  "run_benchmark",
  "optimize",
  "read_spend",
  "manage_tokens",
] as const;

/** One action a remote's policy decides. */
export type Action = (typeof ACTIONS)[number];

/** The kinds of resource a remote's policy is asked about, as Azathoth's calls name them. */
export const RESOURCE_KINDS = [
  "workflow",
  "tool",
  "benchmark",
  "model",
  "run",
  "invocation",
  "experiment",
  "execution",
  "goal",
] as const;

/** One kind of resource a remote's policy is asked about. */
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** A resource as a remote's policy names it: its kind, a space, and its ID. */
export type Resource = `${ResourceKind} ${string}`;

/** Returns a resource as a remote's policy names it, such as `workflow <ID>`. */
export function resource(kind: ResourceKind, id: string): Resource {
  return `${kind} ${id}`;
}

/** Whether an action may be taken, and, when not, why. */
export type Allowance =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

/** The answer that lets an action be taken. */
export const ALLOWED: Allowance = { allowed: true };

/** Says whether an action may be taken on an instance, to a resource if one is named. */
export type Permissions = (
  instance: InstanceScope,
  action: Action,
  resource: Resource | null,
) => Allowance;

/** Allows everything, as the editor's own instance does; what a test gives unless it says. */
export const EVERYTHING: Permissions = () => ALLOWED;

/** Where every page below it asks what may be done; everything is allowed unless it is given. */
export const PermissionsContext = createContext<Permissions>(EVERYTHING);

/**
 * Returns whether an action may be taken: on the instance the page acts on,
 * or on the remote named, such as the one a push goes to.
 */
export function useAllowed(
  action: Action,
  subject: Resource | null = null,
  instance?: string,
): Allowance {
  const scope = useScope();
  const permissions = useContext(PermissionsContext);

  return permissions(instance === undefined ? scope : remoteScope(instance), action, subject);
}

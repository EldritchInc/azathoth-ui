/**
 * What the person may do on each instance (ADR 0009).
 *
 * Every button that changes something names the action of Azathoth's ADR
 * 0127 catalog that it takes, and asks `useAllowed` whether it may. The
 * answer is allowed, or not, with the reason the button shows as it
 * disables itself. On the editor's own instance, and on a core remote, the
 * answer is always allowed; Azathoth 1.6 asks a remote's `/v1/permissions`
 * instead, so no page changes when it does.
 */

import { createContext, useContext } from "react";

import { useScope } from "./scope";

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

/** Whether an action may be taken, and, when not, why. */
export type Allowance =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

/** The answer that lets an action be taken. */
export const ALLOWED: Allowance = { allowed: true };

/** Says whether an action may be taken on an instance, to a resource if one is named. */
export type Permissions = (instance: string, action: Action, resource: string | null) => Allowance;

/** Allows everything: the editor's own instance, and a core remote, where its owner may. */
export const EVERYTHING: Permissions = () => ALLOWED;

/** Where every page below it asks what may be done; everything is allowed unless it is given. */
export const PermissionsContext = createContext<Permissions>(EVERYTHING);

/**
 * Returns whether an action may be taken: on the instance the page acts on,
 * or on the one named, such as the remote a push goes to.
 */
export function useAllowed(
  action: Action,
  resource: string | null = null,
  instance?: string,
): Allowance {
  const scope = useScope();
  const permissions = useContext(PermissionsContext);

  return permissions(instance ?? scope.name, action, resource);
}

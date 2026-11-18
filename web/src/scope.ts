/**
 * The instance a page acts on (ADR 0009): its name, where its endpoints are,
 * and where its pages are.
 *
 * The editor shows the same pages for every instance it works on: its own
 * local one, and, from Azathoth 1.6, each remote, under `/remotes/{name}`.
 * Every client call that acts on an instance takes its endpoint from the
 * scope, every query is kept under the scope's name, and every link to one
 * of its pages takes its address from it, so no page assumes it is showing
 * the editor's own instance.
 */

import { createContext, useContext } from "react";

/** One instance the editor works on, as a page sees it. */
export interface InstanceScope {
  /** How the editor names it: `local`, or a remote's name. */
  readonly name: string;
  /** Where its endpoints are: `/api` for the local instance. */
  readonly api: string;
  /** Where its pages are: nothing for the local instance, whose pages are at the top. */
  readonly pages: string;
}

/** The editor's own instance, whose endpoints are at `/api` and whose pages are at the top. */
export const LOCAL_SCOPE: InstanceScope = { name: "local", api: "/api", pages: "" };

/** The scope every page below it acts on; the local instance unless another is given. */
export const ScopeContext = createContext<InstanceScope>(LOCAL_SCOPE);

/** Returns the instance the page acts on. */
export function useScope(): InstanceScope {
  return useContext(ScopeContext);
}

/** Returns a query key kept under one instance's name, so two instances' answers never mix. */
export function scoped<const K extends readonly unknown[]>(
  scope: InstanceScope,
  key: K,
): readonly [string, ...K] {
  return [scope.name, ...key];
}

/** Returns where one of an instance's pages is: `/workflows/<id>` locally, under a remote's own. */
export function pageOf(scope: InstanceScope, path: string): string {
  if (path === "/") {
    return scope.pages === "" ? "/" : scope.pages;
  }

  return `${scope.pages}${path}`;
}

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

import { createContext, useCallback, useContext } from "react";

import { remoteApiBase } from "./api/client";

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

/** Returns a remote's scope: endpoints under /api/remotes/{name}, pages under /remotes/{name}. */
export function remoteScope(name: string): InstanceScope {
  return { name, api: remoteApiBase(name), pages: `/remotes/${encodeURIComponent(name)}` };
}

/** Returns whether a scope is the editor's own instance; a remote may be named `local` too. */
export function isLocal(scope: InstanceScope): boolean {
  return scope.api === LOCAL_SCOPE.api;
}

/** A remote's overview, or one of its pages: `/remotes/{name}` and what is below it. */
const REMOTE_PAGES = /^\/remotes\/([^/]+)(?:\/|$)/;

/**
 * Returns the instance an address is on: a remote's at its overview and
 * every page below it, and the local instance's everywhere else, the
 * editor's own list of remotes included.
 */
export function scopeAt(pathname: string): InstanceScope {
  const found = REMOTE_PAGES.exec(pathname);

  if (found?.[1] === undefined) {
    return LOCAL_SCOPE;
  }

  try {
    return remoteScope(decodeURIComponent(found[1]));
  } catch {
    return LOCAL_SCOPE;
  }
}

/** The scope every page below it acts on; the local instance unless another is given. */
export const ScopeContext = createContext<InstanceScope>(LOCAL_SCOPE);

/** Returns the instance the page acts on. */
export function useScope(): InstanceScope {
  return useContext(ScopeContext);
}

/**
 * Returns a query key kept under where one instance's endpoints are, so two
 * instances' answers never mix, not even the local one's and a remote's named `local`.
 */
export function scoped<const K extends readonly unknown[]>(
  scope: InstanceScope,
  key: K,
): readonly [string, ...K] {
  return [scope.api, ...key];
}

/** Returns where one of an instance's pages is: `/workflows/<id>` locally, under a remote's own. */
export function pageOf(scope: InstanceScope, path: string): string {
  if (path === "/") {
    return scope.pages === "" ? "/" : scope.pages;
  }

  return `${scope.pages}${path}`;
}

/** Returns where the instance the page acts on shows one of its pages. */
export function usePage(): (path: string) => string {
  const scope = useScope();

  return useCallback((path: string) => pageOf(scope, path), [scope]);
}

/** Returns how a sentence names an instance: the local one as yours, a remote by its name. */
export function instanceLabel(name: string): string {
  return name === LOCAL_SCOPE.name ? "your local instance" : name;
}

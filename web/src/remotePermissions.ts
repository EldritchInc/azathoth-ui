/**
 * What each remote's policy lets the person do, asked of the remote and kept
 * briefly (ADRs 0009 and 0016).
 *
 * A button asks while its page renders. A remote not yet asked is asked of
 * as a whole, `GET /api/remotes/{name}/permissions`, and every resource the
 * page's buttons name is asked of in one `POST` there, at most as many at
 * once as a remote answers about. Until it answers, its buttons wait,
 * disabled, saying so. An answer is kept for `PERMISSIONS_TTL` and shown
 * while it is asked again; switching to a remote asks again at once. The
 * editor's own instance is never asked: everything is allowed there.
 *
 * It is advice for what a page offers; the remote's policy still decides
 * every call.
 */

import { askPermissions, type PermissionsAsker } from "./api/client";
import type { ActionPermission, PermissionsAnswer } from "./api/types";
import {
  ALLOWED,
  type Action,
  type Allowance,
  type Permissions,
  type Resource,
} from "./permissions";
import { isLocal, type InstanceScope } from "./scope";

/** How long an answer is kept before it is asked again, in milliseconds. */
export const PERMISSIONS_TTL = 30_000;

/** How many resources one request asks about: as many as a remote answers about at once. */
export const MAX_RESOURCES = 100;

/** Returns an action in words, as a sentence names it: `run_workflow` as "run workflow". */
function words(action: string): string {
  return action.replaceAll("_", " ");
}

/** What a remote said of one resource, or of itself, and when; or why it couldn't be asked. */
interface Entry {
  told: ReadonlyMap<string, ActionPermission> | null;
  failure: string | null;
  at: number;
  asking: boolean;
}

/** What is to be asked of one remote next: of itself, and of which resources. */
interface Wanted {
  readonly scope: InstanceScope;
  whole: boolean;
  readonly resources: Set<Resource>;
}

/** Returns the key one remote's answer about one resource, or about itself, is kept under. */
function keyOf(scope: InstanceScope, resource: Resource | null): string {
  return `${scope.api}\n${resource ?? ""}`;
}

function byAction(actions: readonly ActionPermission[]): ReadonlyMap<string, ActionPermission> {
  return new Map(actions.map((each) => [each.action, each]));
}

/** What each remote's policy lets the person do, asked as pages need it and kept briefly. */
export class RemotePermissions {
  private readonly entries = new Map<string, Entry>();
  private readonly wanted = new Map<string, Wanted>();
  private readonly listeners = new Set<() => void>();
  private scheduled = false;
  private view: Permissions;

  /** Asks remotes with `ask`, and tells the time with `now`, as tests replace them. */
  constructor(
    private readonly ask: PermissionsAsker = askPermissions,
    private readonly now: () => number = Date.now,
  ) {
    this.view = this.viewed();
  }

  /** Listens for answers; returns what stops listening. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Returns the permissions as they stand: a new function each time an answer arrives. */
  readonly current = (): Permissions => this.view;

  /**
   * Returns whether the person may take an action on an instance, to a
   * resource or to none, asking a remote that hasn't said, or said a while ago.
   */
  allowance(scope: InstanceScope, action: Action, resource: Resource | null): Allowance {
    if (isLocal(scope)) {
      return ALLOWED;
    }

    const entry = this.entries.get(keyOf(scope, resource));

    if (entry === undefined || (!entry.asking && this.now() - entry.at > PERMISSIONS_TTL)) {
      this.want(scope, resource);
    }

    const told = entry?.told?.get(action);

    if (entry?.told !== undefined && entry.told !== null) {
      if (told === undefined) {
        return {
          allowed: false,
          reason: `${scope.name} doesn't say whether you may ${words(action)}.`,
        };
      }

      return told.allowed
        ? ALLOWED
        : {
            allowed: false,
            reason: told.reason ?? `${scope.name}'s policy doesn't let you ${words(action)}.`,
          };
    }

    if (entry?.failure !== undefined && entry.failure !== null) {
      return {
        allowed: false,
        reason: `Couldn't ask ${scope.name} what you may do: ${entry.failure}`,
      };
    }

    return { allowed: false, reason: `Asking ${scope.name} what you may do.` };
  }

  /** Asks one remote again of everything next time a page asks, showing what it said meanwhile. */
  forget(scope: InstanceScope): void {
    if (isLocal(scope)) {
      return;
    }

    const prefix = `${scope.api}\n`;

    for (const [key, entry] of this.entries) {
      if (key.startsWith(prefix) && !entry.asking) {
        entry.at = -Infinity;
      }
    }

    this.changed();
  }

  private want(scope: InstanceScope, resource: Resource | null): void {
    const key = keyOf(scope, resource);
    const entry = this.entries.get(key);

    if (entry === undefined) {
      this.entries.set(key, { told: null, failure: null, at: this.now(), asking: true });
    } else {
      entry.asking = true;
    }

    const wanted = this.wanted.get(scope.api) ?? { scope, whole: false, resources: new Set() };

    if (resource === null) {
      wanted.whole = true;
    } else {
      wanted.resources.add(resource);
    }

    this.wanted.set(scope.api, wanted);

    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        this.flush();
      });
    }
  }

  private flush(): void {
    const wanted = [...this.wanted.values()];
    this.wanted.clear();

    for (const { scope, whole, resources } of wanted) {
      if (whole) {
        void this.asked(scope, null);
      }

      const named = [...resources];

      for (let start = 0; start < named.length; start += MAX_RESOURCES) {
        void this.asked(scope, named.slice(start, start + MAX_RESOURCES));
      }
    }
  }

  private async asked(scope: InstanceScope, resources: readonly Resource[] | null): Promise<void> {
    const keys =
      resources === null ? [keyOf(scope, null)] : resources.map((each) => keyOf(scope, each));

    try {
      const answer: PermissionsAnswer = await this.ask(resources, { base: scope.api });
      const at = this.now();

      if ("actions" in answer) {
        this.told(keyOf(scope, null), byAction(answer.actions), at);
      } else {
        for (const each of answer.resources) {
          this.told(`${scope.api}\n${each.resource}`, byAction(each.actions), at);
        }
      }

      for (const key of keys) {
        const entry = this.entries.get(key);

        if (entry?.asking === true) {
          this.failed(key, `${scope.name} answered without saying.`, at);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const at = this.now();

      for (const key of keys) {
        this.failed(key, message, at);
      }
    }

    this.changed();
  }

  private told(key: string, told: ReadonlyMap<string, ActionPermission>, at: number): void {
    this.entries.set(key, { told, failure: null, at, asking: false });
  }

  private failed(key: string, failure: string, at: number): void {
    this.entries.set(key, { told: null, failure, at, asking: false });
  }

  private changed(): void {
    this.view = this.viewed();

    for (const listener of this.listeners) {
      listener();
    }
  }

  private viewed(): Permissions {
    return (scope, action, resource) => this.allowance(scope, action, resource);
  }
}

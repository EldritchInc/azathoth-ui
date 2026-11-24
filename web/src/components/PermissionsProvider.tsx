import { useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { EVERYTHING, PermissionsContext } from "../permissions";
import { RemotePermissions } from "../remotePermissions";
import { useScope } from "../scope";

/**
 * Gives every page below it what each instance lets the person do (ADR
 * 0016): everything on the editor's own instance, and on a remote what its
 * policy says, asked as the page's buttons need it. Switching to a remote
 * asks it again. `permissions` keeps the answers, a new keeper unless given.
 * Permissions already given above it, as a test gives them, stand.
 */
export function PermissionsProvider({
  children,
  permissions,
}: {
  readonly children: ReactNode;
  readonly permissions?: RemotePermissions;
}) {
  const [kept] = useState(() => permissions ?? new RemotePermissions());
  const current = useSyncExternalStore(kept.subscribe, kept.current);
  const scope = useScope();
  const given = useContext(PermissionsContext);

  useEffect(() => {
    kept.forget(scope);
  }, [kept, scope]);

  return (
    <PermissionsContext value={given === EVERYTHING ? current : given}>
      {children}
    </PermissionsContext>
  );
}

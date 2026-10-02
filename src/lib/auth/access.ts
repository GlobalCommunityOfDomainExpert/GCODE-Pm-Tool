import { ApiError } from "./requireCapability";
import { getCapabilitiesForRoles, type Capability } from "./capabilities";
import { isNodeWithinScopeSubtree, type ScopeKind } from "./scope";
import type { SessionUser } from "./session";

type Actor = Pick<SessionUser, "organizationId" | "assignments">;

// Permissions on a node = union of every assignment that covers it: some
// assignment's role must hold the capability AND that assignment's scope must
// contain the node (or be the node itself). Ancestors of a scope are
// view-only, so they never satisfy this - same rule as isNodeWithinScopeSubtree.
export async function canOnNode(user: Actor, capability: Capability, kind: ScopeKind, nodeId: string): Promise<boolean> {
  for (const a of user.assignments) {
    const caps = await getCapabilitiesForRoles(user.organizationId, [a.role]);
    if (!caps.has(capability)) continue;
    if (await isNodeWithinScopeSubtree(a.scope, kind, nodeId)) return true;
  }
  return false;
}

export async function assertCanOnNode(
  user: Actor,
  capability: Capability,
  kind: ScopeKind,
  nodeId: string,
  message: string
): Promise<void> {
  if (!(await canOnNode(user, capability, kind, nodeId))) throw new ApiError(403, message);
}

// Whole-org standing: an Admin, or anyone holding any unscoped assignment.
export function isOrgWide(user: Pick<SessionUser, "assignments">): boolean {
  return user.assignments.some((a) => a.role === "Admin" || !a.scope);
}

// Distinct non-null scopes across the user's assignments.
export function scopedScopes(user: Pick<SessionUser, "assignments">): string[] {
  return [...new Set(user.assignments.map((a) => a.scope).filter((s): s is string => !!s))];
}

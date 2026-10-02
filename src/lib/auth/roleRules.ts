import { ApiError } from "./requireCapability";

// Roles that are always whole-org: a workspace-scoped Admin or Portfolio
// Manager can't exist (EN_013 / EN_019). The server is the real gate - the
// UI locking the scope control is only a convenience.
const ORG_WIDE_ROLES = ["Admin", "Portfolio Manager"] as const;

export function assertValidAccess(roles: string[], scope: string | null): void {
  if (roles.length === 0) throw new ApiError(400, "Pick at least one role.");
  const bound = ORG_WIDE_ROLES.find((r) => roles.includes(r));
  if (bound && scope) {
    throw new ApiError(400, `${bound} access always covers the whole organization - it can't be limited to a scope.`);
  }
}

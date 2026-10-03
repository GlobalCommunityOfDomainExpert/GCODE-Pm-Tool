import type { Prisma } from "@prisma/client";

export type Assignment = { role: string; scope: string | null };

// RoleAssignment rows win; the legacy roles x scope columns are the fallback
// for a user with no rows. Phase 1 keeps both in sync (dual-write), so the
// two only ever disagree if a row was written by something that bypassed
// syncRoleAssignments().
export function assignmentsOfUser(user: {
  roles: string[];
  scope: string | null;
  roleAssignments?: { role: string; scope: string | null }[];
}): Assignment[] {
  if (user.roleAssignments && user.roleAssignments.length > 0) {
    return user.roleAssignments.map(({ role, scope }) => ({ role, scope }));
  }
  return [...new Set(user.roles)].map((role) => ({ role, scope: user.scope }));
}

// Dual-write: call in the same transaction that writes User.roles / User.scope.
// RoleAssignment is derived data, so replace-all is safe (and idempotent).
export async function setRoleAssignments(tx: Prisma.TransactionClient, userId: string, assignments: Assignment[]): Promise<void> {
  await tx.roleAssignment.deleteMany({ where: { userId } });
  if (assignments.length === 0) return;
  await tx.roleAssignment.createMany({
    data: assignments.map(({ role, scope }) => ({ userId, role, scope })),
    skipDuplicates: true,
  });
}

// Single-scope convenience (join codes, org founder): every role on one scope.
export async function syncRoleAssignments(
  tx: Prisma.TransactionClient,
  userId: string,
  roles: string[],
  scope: string | null
): Promise<void> {
  await setRoleAssignments(tx, userId, [...new Set(roles)].map((role) => ({ role, scope })));
}

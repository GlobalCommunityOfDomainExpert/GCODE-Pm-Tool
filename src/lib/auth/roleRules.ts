import { prisma } from "@/lib/prisma";
import { ApiError } from "./requireCapability";
import { ROLE_CHOICES } from "./capabilityConstants";
import { parseScope } from "./scope";
import { assertNodeInOrg } from "./org";
import type { Assignment } from "./assignments";

// Admin is always whole-org: a workspace-scoped Admin can't exist (EN_013).
// Portfolio Manager is deliberately NOT here - it can be limited to a scope
// (whole-org is optional). The server is the real gate; the UI locking the
// scope control is only a convenience.

export function assertValidAccess(roles: string[], scope: string | null): void {
  if (roles.length === 0) throw new ApiError(400, "Pick at least one role.");
  if (roles.includes("Admin") && scope) {
    throw new ApiError(400, "Admin access always covers the whole organization - it can't be limited to a scope.");
  }
}

export type NormalizedAccess = {
  assignments: Assignment[];
  // Legacy User.roles / User.scope columns, kept in sync (dual-write). roles is
  // the union; scope can only hold ONE value, so for a multi-scope person it is
  // the first scoped assignment's scope - the narrower choice, never null
  // (null would read as whole-org) unless every assignment really is whole-org.
  roles: string[];
  scope: string | null;
};

// One entry point for "who gets what access" on invite and edit. Accepts the
// multi-scope payload `assignments: [{ role, scope }]`, or the legacy
// `roles: string[]` + single `scope` (still sent by older forms and tests).
export async function normalizeAccess(organizationId: string, body: unknown): Promise<NormalizedAccess> {
  const b = (body ?? {}) as { assignments?: unknown; roles?: unknown; scope?: unknown };

  let raw: { role: unknown; scope: unknown }[];
  if (Array.isArray(b.assignments)) {
    raw = b.assignments as { role: unknown; scope: unknown }[];
  } else {
    const roles = Array.isArray(b.roles) && b.roles.length ? (b.roles as unknown[]) : ["Team Member"];
    raw = roles.map((role) => ({ role, scope: b.scope }));
  }
  if (raw.length === 0) throw new ApiError(400, "Pick at least one role.");

  const customRoles = await prisma.customRole.findMany({ where: { organizationId }, select: { name: true } });
  const allowed = new Set<string>([...ROLE_CHOICES, ...customRoles.map((c) => c.name)]);

  const seen = new Set<string>();
  const assignments: Assignment[] = [];
  for (const item of raw) {
    const role = typeof item?.role === "string" ? item.role.trim() : "";
    const scope = typeof item?.scope === "string" && item.scope.trim() ? item.scope.trim() : null;
    if (!role || !allowed.has(role)) throw new ApiError(400, `"${role || "(empty)"}" isn't a valid role.`);
    assertValidAccess([role], scope);
    if (scope) {
      const parsed = parseScope(scope);
      if (!parsed) throw new ApiError(400, "That scope isn't valid.");
      // Tenancy: a scope pointing into another org's tree would grant access to it.
      await assertNodeInOrg(parsed.kind, parsed.id, organizationId);
    }
    const key = `${role}@${scope ?? ""}`;
    if (seen.has(key)) throw new ApiError(400, `"${role}" is assigned twice for the same scope.`);
    seen.add(key);
    assignments.push({ role, scope });
  }

  return {
    assignments,
    roles: [...new Set(assignments.map((a) => a.role))],
    scope: assignments.find((a) => a.scope)?.scope ?? null,
  };
}

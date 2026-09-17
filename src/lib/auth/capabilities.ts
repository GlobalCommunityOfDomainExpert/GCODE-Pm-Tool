import { prisma } from "@/lib/prisma";

// Mirrors wireframe/js/components/nodeFormModal.js's CAPABILITY_GROUPS/ROLE_CHOICES
// (docs/roles_and_permissions.md's 5-tier model) - this is the same vocabulary the
// Admin sees in Role Definitions, kept in one place so app code and seed data can't drift.
export const CAPABILITY_GROUPS = [
  { name: "Workspaces & Projects", items: ["View Workspaces", "Create/Edit Workspaces", "Create/Edit Projects", "Create/Edit Tasks"] },
  { name: "Task Execution", items: ["Execute Assigned Tasks", "Comment & Collaborate"] },
  { name: "Team & Administration", items: ["Manage Team Members", "Approve Requests"] },
  { name: "Reporting", items: ["View Reports & Dashboards"] },
] as const;

export const ALL_CAPABILITIES = CAPABILITY_GROUPS.flatMap((g) => g.items);
export type Capability = (typeof ALL_CAPABILITIES)[number];

export const BUILT_IN_ROLES = ["Admin", "Portfolio Manager", "Program Manager", "Project Manager", "Team Member"] as const;
export type BuiltInRole = (typeof BUILT_IN_ROLES)[number];

// Seeded into RoleCapability by prisma/seed-rbac.ts. "Within Scope" / "Assigned
// Only" nuances from the Role Definitions matrix are enforced by the separate
// scope-filter layer (src/lib/auth/scope.ts), not by the capability set itself.
export const ROLE_CAPABILITY_MATRIX: Record<BuiltInRole, Capability[]> = {
  Admin: [...ALL_CAPABILITIES],
  "Portfolio Manager": ["View Workspaces", "Create/Edit Workspaces", "Create/Edit Projects", "Comment & Collaborate", "View Reports & Dashboards"],
  "Program Manager": ["View Workspaces", "Create/Edit Projects", "Create/Edit Tasks", "Comment & Collaborate", "View Reports & Dashboards"],
  "Project Manager": ["View Workspaces", "Create/Edit Tasks", "Comment & Collaborate", "View Reports & Dashboards"],
  "Team Member": ["View Workspaces", "Execute Assigned Tasks", "Comment & Collaborate"],
};

// Union of capabilities across every role the user holds (built-in + custom).
// Built-in roles read RoleCapability; anything else is looked up in CustomRole
// scoped to the caller's org - same code path, so editing a custom role's
// checkboxes changes what it can do on the very next request.
export async function getCapabilitiesForRoles(organizationId: string, roles: string[]): Promise<Set<string>> {
  if (roles.length === 0) return new Set();

  const [builtIn, custom] = await Promise.all([
    prisma.roleCapability.findMany({ where: { roleName: { in: roles } } }),
    prisma.customRole.findMany({ where: { organizationId, name: { in: roles } } }),
  ]);

  const caps = new Set<string>();
  for (const row of builtIn) caps.add(row.capability);
  for (const role of custom) for (const cap of role.capabilities) caps.add(cap);
  return caps;
}

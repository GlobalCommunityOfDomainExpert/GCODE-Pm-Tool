// Pure constants, no server-only imports (no Prisma) - safe to import from
// client components too (e.g. rendering the Role Definitions matrix, or a
// role/capability picker), unlike capabilities.ts which pulls in the DB client.

// Only capabilities some route actually enforces belong here - the matrix UI
// and the RoleCapability seed both read this list. (View Workspaces, Comment &
// Collaborate, Approve Requests and View Reports & Dashboards were removed:
// nothing in this version checks them. Visibility comes from scope, not a
// capability.) Add one back together with the feature that enforces it.
export const CAPABILITY_GROUPS = [
  {
    name: "Workspaces & Projects",
    items: ["Create/Edit Workspaces", "Create/Edit Initiatives", "Create/Edit Programs", "Create/Edit Projects", "Create/Edit Tasks"],
  },
  { name: "Task Execution", items: ["Execute Assigned Tasks"] },
  { name: "Team & Administration", items: ["Manage Team Members"] },
] as const;

export const ALL_CAPABILITIES = CAPABILITY_GROUPS.flatMap((g) => g.items);
export type Capability = (typeof ALL_CAPABILITIES)[number];

export const BUILT_IN_ROLES = ["Admin", "Portfolio Manager", "Program Manager", "Project Manager", "Team Member"] as const;
export type BuiltInRole = (typeof BUILT_IN_ROLES)[number];

export const ROLE_CAPABILITY_MATRIX: Record<BuiltInRole, Capability[]> = {
  Admin: [...ALL_CAPABILITIES],
  "Portfolio Manager": ["Create/Edit Workspaces", "Create/Edit Initiatives", "Create/Edit Programs", "Create/Edit Projects", "Create/Edit Tasks"],
  "Program Manager": ["Create/Edit Programs", "Create/Edit Projects", "Create/Edit Tasks"],
  "Project Manager": ["Create/Edit Tasks"],
  "Team Member": ["Execute Assigned Tasks"],
};

// Role choices offered in pickers (invite modal, invite-code generator).
// "Client" is a view-only convention (no capabilities of its own; always
// scoped) rather than a 6th tier in ROLE_CAPABILITY_MATRIX.
export const ROLE_CHOICES = [...BUILT_IN_ROLES, "Client"] as const;

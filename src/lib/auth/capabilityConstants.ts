// Pure constants, no server-only imports (no Prisma) - safe to import from
// client components too (e.g. rendering the Role Definitions matrix, or a
// role/capability picker), unlike capabilities.ts which pulls in the DB client.

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

export const ROLE_CAPABILITY_MATRIX: Record<BuiltInRole, Capability[]> = {
  Admin: [...ALL_CAPABILITIES],
  "Portfolio Manager": ["View Workspaces", "Create/Edit Workspaces", "Create/Edit Projects", "Comment & Collaborate", "View Reports & Dashboards"],
  "Program Manager": ["View Workspaces", "Create/Edit Projects", "Create/Edit Tasks", "Comment & Collaborate", "View Reports & Dashboards"],
  "Project Manager": ["View Workspaces", "Create/Edit Tasks", "Comment & Collaborate", "View Reports & Dashboards"],
  "Team Member": ["View Workspaces", "Execute Assigned Tasks", "Comment & Collaborate"],
};

// Role choices offered in pickers (invite modal, invite-code generator).
// "Client" is a view-only convention (no capabilities of its own; always
// scoped) rather than a 6th tier in ROLE_CAPABILITY_MATRIX.
export const ROLE_CHOICES = [...BUILT_IN_ROLES, "Client"] as const;

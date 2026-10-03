import { getCapabilitiesForRoles, type Capability } from "./capabilities";
import { parseScope } from "./scope";
import type { SessionUser } from "./session";
import type { HierarchyLevel, Perms } from "@/lib/types";

const EDIT_CAP: Record<HierarchyLevel, Capability> = {
  workspace: "Create/Edit Workspaces",
  initiative: "Create/Edit Initiatives",
  program: "Create/Edit Programs",
  project: "Create/Edit Projects",
  task: "Create/Edit Tasks",
};

const CHILD_LEVEL: Partial<Record<HierarchyLevel, HierarchyLevel>> = {
  workspace: "initiative",
  initiative: "program",
  program: "project",
  project: "task",
};

const CHILD_KEY: Partial<Record<HierarchyLevel, "initiatives" | "programs" | "projects" | "tasks">> = {
  workspace: "initiatives",
  initiative: "programs",
  program: "projects",
  project: "tasks",
};

type Actor = Pick<SessionUser, "id" | "organizationId" | "assignments">;

// Capabilities per distinct role are resolved once up front; after that each
// node's answer is pure in-memory work against its ancestor ids (the same
// "scope root is the node or one of its ancestors" rule canOnNode uses), so
// stamping a whole tree costs no per-node queries.
export async function buildPermResolver(user: Actor) {
  const roles = [...new Set(user.assignments.map((a) => a.role))];
  const capsByRole = new Map<string, Set<string>>();
  await Promise.all(
    roles.map(async (role) => capsByRole.set(role, await getCapabilitiesForRoles(user.organizationId, [role])))
  );

  const scopeIds = user.assignments.map((a) => ({ role: a.role, scopeId: parseScope(a.scope)?.id ?? null, hasScope: !!a.scope }));

  // A dangling/garbage scope string (hasScope but unparseable) covers nothing.
  function allowed(capability: Capability, ancestorsAndSelf: string[]): boolean {
    return scopeIds.some(
      (a) => capsByRole.get(a.role)?.has(capability) && (!a.hasScope || (a.scopeId !== null && ancestorsAndSelf.includes(a.scopeId)))
    );
  }

  function permsFor(level: HierarchyLevel, ancestorsAndSelf: string[], responsibleId?: string | null): Perms {
    const isResponsible = level === "task" && !!responsibleId && responsibleId === user.id;
    const edit = isResponsible || allowed(EDIT_CAP[level], ancestorsAndSelf);
    const childLevel = CHILD_LEVEL[level];
    const perms: Perms = {
      edit,
      delete: edit, // same capability on the server (EN_021: responsible gets both)
      createChild: childLevel ? allowed(EDIT_CAP[childLevel], ancestorsAndSelf) : false,
    };
    if (level === "task") perms.changeStatus = edit || allowed("Execute Assigned Tasks", ancestorsAndSelf);
    return perms;
  }

  // Org-wide only: a brand-new Workspace has no parent to be "inside".
  const canCreateWorkspace = scopeIds.some((a) => !a.hasScope && capsByRole.get(a.role)?.has(EDIT_CAP.workspace));

  return { permsFor, canCreateWorkspace };
}

export type PermResolver = Awaited<ReturnType<typeof buildPermResolver>>;

type Stampable = { id: string; responsibleId?: string | null; perms?: Perms } & Partial<Record<"initiatives" | "programs" | "projects" | "tasks", Stampable[]>>;

// Walks a (scope-filtered) workspace subtree and sets `.perms` on every node.
// Mutates in place, like pruneNodes does - the tree is a fresh per-request copy.
export function stampPerms(node: Stampable, level: HierarchyLevel, resolver: PermResolver, ancestors: string[] = []): void {
  const chain = [...ancestors, node.id];
  node.perms = resolver.permsFor(level, chain, node.responsibleId);
  const childKey = CHILD_KEY[level];
  const childLevel = CHILD_LEVEL[level];
  if (!childKey || !childLevel) return;
  for (const child of node[childKey] ?? []) stampPerms(child, childLevel, resolver, chain);
}

// Typed read of a stamped node (Prisma node types don't carry `perms`).
// Unstamped = no rights, so a page that forgets to stamp hides controls
// rather than showing ones the server would reject.
export function getPerms(node: unknown): Perms {
  return (node as { perms?: Perms }).perms ?? { edit: false, delete: false, createChild: false };
}

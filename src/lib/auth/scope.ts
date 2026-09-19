import { prisma } from "@/lib/prisma";
import { ApiError } from "./requireCapability";
import type { HierarchyLevel } from "@/lib/types";

export type ScopeKind = Exclude<HierarchyLevel, "task">;

export type ParsedScope = { kind: ScopeKind; id: string };

// "{kind}:{id}" per the v0.2 data model, or null = whole org (Admin/unscoped roles).
export function parseScope(scope: string | null): ParsedScope | null {
  if (!scope) return null;
  const [kind, id] = scope.split(":");
  if (!id || !["workspace", "initiative", "program", "project"].includes(kind)) return null;
  return { kind: kind as ScopeKind, id };
}

// Ancestor chain for one node, root-first: [workspaceId, initiativeId?, programId?, projectId?].
// Returns null if the node doesn't exist (e.g. scope points at something deleted).
async function ancestorChain(kind: ScopeKind, id: string): Promise<string[] | null> {
  if (kind === "workspace") {
    const ws = await prisma.workspace.findUnique({ where: { id }, select: { id: true } });
    return ws ? [ws.id] : null;
  }
  if (kind === "initiative") {
    const row = await prisma.initiative.findUnique({ where: { id }, select: { id: true, workspaceId: true } });
    return row ? [row.workspaceId, row.id] : null;
  }
  if (kind === "program") {
    const row = await prisma.program.findUnique({
      where: { id },
      select: { id: true, initiative: { select: { id: true, workspaceId: true } } },
    });
    return row ? [row.initiative.workspaceId, row.initiative.id, row.id] : null;
  }
  // project
  const row = await prisma.project.findUnique({
    where: { id },
    select: { id: true, program: { select: { id: true, initiative: { select: { id: true, workspaceId: true } } } } },
  });
  return row ? [row.program.initiative.workspaceId, row.program.initiative.id, row.program.id, row.id] : null;
}

// Visibility: the node is somewhere on the scope's own ancestor chain (an
// ancestor - "contextual view-only" per docs/roles_and_permissions.md) or the
// scope is somewhere on *this* node's ancestor chain (the node is inside the
// scope's subtree - fully manageable). `scope: null` always passes (whole org).
export async function isNodeVisible(scope: string | null, kind: ScopeKind, nodeId: string): Promise<boolean> {
  const parsed = parseScope(scope);
  if (!parsed) return true;

  if (parsed.kind === kind && parsed.id === nodeId) return true;

  const nodeChain = await ancestorChain(kind, nodeId);
  if (!nodeChain) return false;

  // Case 1: node is inside the scope's subtree - scope's id appears in node's own chain.
  if (nodeChain.includes(parsed.id)) return true;

  // Case 2: node is an ancestor of the scope root - node's id appears in the scope's own chain.
  const scopeChain = await ancestorChain(parsed.kind, parsed.id);
  if (scopeChain?.includes(nodeId)) return true;

  return false;
}

// Stricter than isNodeVisible: true only for the scope root itself or a
// descendant of it. Ancestors are view-only, never writable - use this to
// gate create/edit/delete, isNodeVisible to gate read/list.
export async function isNodeWithinScopeSubtree(scope: string | null, kind: ScopeKind, nodeId: string): Promise<boolean> {
  const parsed = parseScope(scope);
  if (!parsed) return true;
  if (parsed.kind === kind && parsed.id === nodeId) return true;

  const nodeChain = await ancestorChain(kind, nodeId);
  return nodeChain ? nodeChain.includes(parsed.id) : false;
}

// The workspace id a scope's subtree lives under - useful for scoping a
// top-level `workspace.findMany` down to the one relevant workspace.
export async function scopeWorkspaceId(scope: string | null): Promise<string | null> {
  const parsed = parseScope(scope);
  if (!parsed) return null;
  const chain = await ancestorChain(parsed.kind, parsed.id);
  return chain ? chain[0] : null;
}

// Full root-first ancestor chain of the scope root itself, e.g. scope
// "project:X" -> [workspaceId, initiativeId, programId, "X"]. `null` means
// "whole org, no filtering" (scope: null - Admin/unscoped roles). A non-null
// but *empty* array means the scope string parsed but points at a deleted/
// dangling node - callers must treat that as "nothing visible", not "no
// filtering", so a stale scope fails closed instead of silently granting
// full-org access. Used by tree.ts to prune the workspace tree down to
// "ancestors of the scope root (single path, for breadcrumb context) plus
// the scope root's full subtree" - never the scope root's siblings.
export async function getScopeChain(scope: string | null): Promise<string[] | null> {
  const parsed = parseScope(scope);
  if (!parsed) return null;
  const chain = await ancestorChain(parsed.kind, parsed.id);
  return chain ?? [];
}

// Org-tenancy check (harder boundary than RBAC scope - applies regardless of
// role, even Admin). Unlike ancestorChain/ScopeKind above, this also covers
// "task" - a task's org is its project's workspace's org.
export async function workspaceIdForAnyNode(level: HierarchyLevel, id: string): Promise<string | null> {
  if (level === "task") {
    const task = await prisma.task.findUnique({ where: { id }, select: { projectId: true } });
    if (!task) return null;
    const chain = await ancestorChain("project", task.projectId);
    return chain ? chain[0] : null;
  }
  const chain = await ancestorChain(level, id);
  return chain ? chain[0] : null;
}

// Assignee picker support: the org teammates who may be set as
// accountable/responsible on a given node. `kind`/`nodeId` identify the node
// being assigned FOR - the item's own (level, id) when editing an existing
// item, or its parent's (level, id) when creating a new one underneath it
// (see CreateItemModal's PARENT_KIND map). `kind: null` means "no parent to
// scope against" (creating a brand-new root Workspace) - only org-wide
// (unscoped) users are offered, since a scoped user's scope always points at
// an *existing* node and can't yet relate to one that doesn't exist.
// Mirrors isNodeWithinScopeSubtree's rule but computes the chain once and
// checks every candidate in memory instead of one query per user.
export async function assignableUsersForNode(
  organizationId: string,
  kind: ScopeKind | null,
  nodeId: string | null
): Promise<{ id: string; name: string; email: string | null }[]> {
  const candidates = await prisma.user.findMany({
    where: { organizationId, status: "active" },
    select: { id: true, name: true, email: true, scope: true },
    orderBy: { name: "asc" },
  });

  if (kind === null || nodeId === null) {
    return candidates.filter((u) => !u.scope).map(({ id, name, email }) => ({ id, name, email }));
  }

  const chain = await ancestorChain(kind, nodeId);
  if (!chain) return [];

  return candidates
    .filter((u) => {
      const parsed = parseScope(u.scope);
      if (!parsed) return true;
      if (parsed.kind === kind && parsed.id === nodeId) return true;
      return chain.includes(parsed.id);
    })
    .map(({ id, name, email }) => ({ id, name, email }));
}

// Server-side mirror of assignableUsersForNode, for the create/update routes:
// throws unless `assigneeUserId` is null/undefined (no assignee - always ok)
// or names an active User in the caller's org whose scope covers `nodeId`.
// The picker (assignableUsersForNode) already filters the client's choices,
// but a client can still POST an arbitrary id, so this is the real gate.
export async function assertAssigneeAllowed(
  organizationId: string,
  kind: ScopeKind | null,
  nodeId: string | null,
  assigneeUserId: string | null | undefined
): Promise<void> {
  if (!assigneeUserId) return;

  const candidate = await prisma.user.findUnique({
    where: { id: assigneeUserId },
    select: { organizationId: true, scope: true, status: true },
  });
  if (!candidate || candidate.organizationId !== organizationId || candidate.status !== "active") {
    throw new ApiError(400, "That teammate isn't part of your organization.");
  }

  if (kind === null || nodeId === null) {
    if (candidate.scope) throw new ApiError(400, "That teammate doesn't have scope to be assigned here.");
    return;
  }

  if (!(await isNodeWithinScopeSubtree(candidate.scope, kind, nodeId))) {
    throw new ApiError(400, "That teammate doesn't have scope to be assigned here.");
  }
}

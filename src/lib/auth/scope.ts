import { prisma } from "@/lib/prisma";
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

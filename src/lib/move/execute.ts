import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/requireCapability";
import { slugify, uniqueSlug } from "@/lib/slug";
import type { HierarchyLevel } from "@/lib/types";
import { checkMove, countTasks, flatten, levelAt, levelNo, type MoveNode } from "./plan";

type Tx = Prisma.TransactionClient;

type ContainerLevel = Exclude<HierarchyLevel, "task">;

type ContainerRow = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  accountableId: string | null;
  createdAt: Date;
};

// Whole org as a MoveNode forest (tasks included, they're what the rules
// count). One query per level - same "small tables, load it all" approach
// tree.ts uses for the workspace pages.
export async function loadOrgTree(organizationId: string): Promise<MoveNode[]> {
  const workspaces = await prisma.workspace.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      initiatives: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          programs: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              projects: {
                orderBy: { createdAt: "asc" },
                select: { id: true, name: true, tasks: { orderBy: { createdAt: "asc" }, select: { id: true, title: true } } },
              },
            },
          },
        },
      },
    },
  });

  return workspaces.map((w) => ({
    id: w.id,
    level: "workspace" as const,
    name: w.name,
    children: w.initiatives.map((i) => ({
      id: i.id,
      level: "initiative" as const,
      name: i.name,
      children: i.programs.map((p) => ({
        id: p.id,
        level: "program" as const,
        name: p.name,
        children: p.projects.map((pr) => ({
          id: pr.id,
          level: "project" as const,
          name: pr.name,
          children: pr.tasks.map((t) => ({ id: t.id, level: "task" as const, name: t.title, children: [] })),
        })),
      })),
    })),
  }));
}

export interface MoveRequest {
  sourceId: string;
  targetId: string;
  deleteIds: string[];
}

export interface MoveResult {
  newId: string | null;
  newLevel: HierarchyLevel;
  converted: number;
  removed: number;
  tasks: number;
}

// Moves one item (and its subtree) under another item. Levels live in five
// separate tables with ON DELETE CASCADE down the chain, so a level change is
// "create the row in the new table, re-point its children, only then remove
// the emptied old row". Everything runs in one transaction and ends with
// hard checks (no leftover children under a row about to be deleted, task
// count unchanged) so a mistake rolls back instead of cascading data away.
export async function moveItem(organizationId: string, req: MoveRequest): Promise<MoveResult> {
  const forest = await loadOrgTree(organizationId);
  const index = new Map<string, { node: MoveNode; chain: string[] }>();
  (function index_(nodes: MoveNode[], chain: string[]) {
    for (const n of nodes) {
      const c = [...chain, n.id];
      index.set(n.id, { node: n, chain: c });
      index_(n.children, c);
    }
  })(forest, []);

  const src = index.get(req.sourceId);
  const tgt = index.get(req.targetId);
  if (!src || !tgt) throw new ApiError(404, "Not found.");

  if (tgt.node.level === "task") throw new ApiError(400, "Tasks can't contain other items.");
  if (tgt.chain.includes(src.node.id)) throw new ApiError(400, "An item can't be moved into itself or one of its own children.");
  const currentParent = src.chain.length > 1 ? src.chain[src.chain.length - 2] : null;
  if (currentParent === tgt.node.id) throw new ApiError(400, "This item is already there.");

  const deleteSet = new Set(req.deleteIds);
  const check = checkMove(src.node, levelNo(tgt.node.level), deleteSet);
  if (!check.ok) throw new ApiError(400, check.errors[0] || "That move isn't valid.");

  const taskIds = flatten(src.node).filter((n) => n.level === "task").map((n) => n.id);

  return prisma.$transaction(
    async (tx) => {
      const ctx = {
        tx,
        shift: check.shift,
        deleteSet,
        idMap: new Map<string, { kind: ContainerLevel; id: string }>(),
        oldRows: [] as { kind: ContainerLevel; id: string }[],
        removedScopes: [] as string[],
        movedRootNewId: null as string | null,
        movedRootLevel: levelAt(check.newRootLevel),
      };

      await place(ctx, src.node, { level: tgt.node.level as ContainerLevel, id: tgt.node.id }, 0, true);

      // Old shells deleted deepest-first, each only if truly empty.
      for (const row of ctx.oldRows.reverse()) {
        await assertEmptyThenDelete(tx, row.kind, row.id);
      }

      // Role scopes: a converted node keeps its people (scope string rewritten
      // to the new kind:id); a removed node's assignments are dropped. A
      // dangling scope fails closed, never widens to whole-org.
      for (const [oldId, to] of ctx.idMap) {
        const oldKind = flatten(src.node).find((n) => n.id === oldId)!.level;
        await tx.roleAssignment.updateMany({ where: { scope: `${oldKind}:${oldId}` }, data: { scope: `${to.kind}:${to.id}` } });
        await tx.user.updateMany({ where: { scope: `${oldKind}:${oldId}` }, data: { scope: `${to.kind}:${to.id}` } });
      }
      if (ctx.removedScopes.length > 0) {
        await tx.roleAssignment.deleteMany({ where: { scope: { in: ctx.removedScopes } } });
      }

      const tasksAfter = await tx.task.count({ where: { id: { in: taskIds } } });
      if (tasksAfter !== taskIds.length) throw new ApiError(500, "Move aborted: task count changed.");

      return {
        newId: ctx.movedRootNewId,
        newLevel: ctx.movedRootLevel,
        converted: check.converted.length,
        removed: check.deleted.length,
        tasks: countTasks(src.node),
      };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
}

type Ctx = {
  tx: Tx;
  shift: number;
  deleteSet: Set<string>;
  idMap: Map<string, { kind: ContainerLevel; id: string }>;
  oldRows: { kind: ContainerLevel; id: string }[];
  removedScopes: string[];
  movedRootNewId: string | null;
  movedRootLevel: HierarchyLevel;
};

// Re-homes `node` (and recursively its children) under `parent`. `deletedAbove`
// counts removed ancestors inside the moved subtree, so the node's new level is
// original + shift - deletedAbove.
async function place(ctx: Ctx, node: MoveNode, parent: { level: ContainerLevel; id: string }, deletedAbove: number, isRoot = false) {
  const { tx } = ctx;
  const orig = levelNo(node.level);

  if (ctx.deleteSet.has(node.id)) {
    ctx.removedScopes.push(`${node.level}:${node.id}`);
    ctx.oldRows.push({ kind: node.level as ContainerLevel, id: node.id });
    // Children take the removed node's place under `parent`.
    for (const c of node.children) await place(ctx, c, parent, deletedAbove + 1);
    return;
  }

  const newNo = orig + ctx.shift - deletedAbove;

  if (node.level === "task") {
    await tx.task.update({ where: { id: node.id }, data: { projectId: parent.id } });
    if (isRoot) ctx.movedRootNewId = node.id;
    return;
  }

  const kind = node.level as ContainerLevel;
  let self: { level: ContainerLevel; id: string };

  if (newNo === orig) {
    // Same level: just re-parent. Id stays, so URLs/scopes keyed on it survive.
    await reparent(tx, kind, node.id, parent);
    self = { level: kind, id: node.id };
  } else {
    const newKind = levelAt(newNo) as ContainerLevel;
    const created = await recreate(tx, kind, node.id, newKind, parent);
    ctx.idMap.set(node.id, { kind: newKind, id: created });
    ctx.oldRows.push({ kind, id: node.id });
    self = { level: newKind, id: created };
  }

  if (isRoot) {
    ctx.movedRootNewId = self.id;
    ctx.movedRootLevel = self.level;
  }
  for (const c of node.children) await place(ctx, c, self, deletedAbove);
}

async function siblingSlug(tx: Tx, kind: ContainerLevel, parent: { id: string }, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  const notSelf = excludeId ? { NOT: { id: excludeId } } : {};
  return uniqueSlug(base, async (slug) => {
    if (kind === "initiative") return (await tx.initiative.count({ where: { workspaceId: parent.id, slug, ...notSelf } })) > 0;
    if (kind === "program") return (await tx.program.count({ where: { initiativeId: parent.id, slug, ...notSelf } })) > 0;
    if (kind === "project") return (await tx.project.count({ where: { programId: parent.id, slug, ...notSelf } })) > 0;
    return false;
  });
}

async function reparent(tx: Tx, kind: ContainerLevel, id: string, parent: { id: string }) {
  if (kind === "workspace") throw new ApiError(400, "A workspace can't be re-parented.");
  const row = await readRow(tx, kind, id);
  const slug = await siblingSlug(tx, kind, parent, row.name, id);
  if (kind === "initiative") await tx.initiative.update({ where: { id }, data: { workspaceId: parent.id, slug } });
  if (kind === "program") await tx.program.update({ where: { id }, data: { initiativeId: parent.id, slug } });
  if (kind === "project") await tx.project.update({ where: { id }, data: { programId: parent.id, slug } });
}

async function readRow(tx: Tx, kind: ContainerLevel, id: string): Promise<ContainerRow> {
  const select = { id: true, name: true, description: true, status: true, accountableId: true, createdAt: true } as const;
  const row =
    kind === "workspace"
      ? await tx.workspace.findUnique({ where: { id }, select })
      : kind === "initiative"
      ? await tx.initiative.findUnique({ where: { id }, select })
      : kind === "program"
      ? await tx.program.findUnique({ where: { id }, select })
      : await tx.project.findUnique({ where: { id }, select });
  if (!row) throw new ApiError(404, "Not found.");
  return row;
}

// New row in the target level's table carrying over every shared field
// (name, description, status, accountable, createdAt). Workspace-only fields
// (logo, organizationId) can't exist below L1 and are dropped with the old row.
async function recreate(tx: Tx, from: ContainerLevel, id: string, to: ContainerLevel, parent: { id: string }): Promise<string> {
  const row = await readRow(tx, from, id);
  const slug = await siblingSlug(tx, to, parent, row.name);
  const common = {
    name: row.name,
    slug,
    description: row.description,
    status: row.status,
    accountableId: row.accountableId,
    createdAt: row.createdAt,
  };
  if (to === "initiative") return (await tx.initiative.create({ data: { ...common, workspaceId: parent.id }, select: { id: true } })).id;
  if (to === "program") return (await tx.program.create({ data: { ...common, initiativeId: parent.id }, select: { id: true } })).id;
  if (to === "project") return (await tx.project.create({ data: { ...common, programId: parent.id }, select: { id: true } })).id;
  throw new ApiError(400, "Nothing can be moved to the top level.");
}

// ON DELETE CASCADE would silently take any child still pointing here, so
// verify the row is empty first and abort the whole transaction if not.
async function assertEmptyThenDelete(tx: Tx, kind: ContainerLevel, id: string) {
  const remaining =
    kind === "workspace"
      ? await tx.initiative.count({ where: { workspaceId: id } })
      : kind === "initiative"
      ? await tx.program.count({ where: { initiativeId: id } })
      : kind === "program"
      ? await tx.project.count({ where: { programId: id } })
      : await tx.task.count({ where: { projectId: id } });
  if (remaining > 0) throw new ApiError(500, "Move aborted: a removed level still had children.");

  if (kind === "workspace") await tx.workspace.delete({ where: { id } });
  else if (kind === "initiative") await tx.initiative.delete({ where: { id } });
  else if (kind === "program") await tx.program.delete({ where: { id } });
  else await tx.project.delete({ where: { id } });
}

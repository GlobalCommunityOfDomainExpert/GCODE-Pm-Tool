import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/requireCapability";
import { assignmentsOfUser } from "@/lib/auth/assignments";
import { parseScope } from "@/lib/auth/scope";
import { slugify, uniqueSlug } from "@/lib/slug";
import type { HierarchyLevel } from "@/lib/types";
import type { Anchor, ExistingNode, OrgUser, Plan } from "./plan";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// Whole org as a flat list. Per-org volume is small (same "load it all"
// approach as lib/move and lib/tree), one query per level.
export async function loadOrgNodes(organizationId: string): Promise<ExistingNode[]> {
  const inOrg = { organizationId };
  const [ws, ini, prog, proj, task] = await Promise.all([
    prisma.workspace.findMany({ where: inOrg, orderBy: { createdAt: "asc" } }),
    prisma.initiative.findMany({ where: { workspace: inOrg }, orderBy: { createdAt: "asc" } }),
    prisma.program.findMany({ where: { initiative: { workspace: inOrg } }, orderBy: { createdAt: "asc" } }),
    prisma.project.findMany({ where: { program: { initiative: { workspace: inOrg } } }, orderBy: { createdAt: "asc" } }),
    prisma.task.findMany({ where: { project: { program: { initiative: { workspace: inOrg } } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const out: ExistingNode[] = [];
  const container = (level: HierarchyLevel, rows: { id: string; name: string; description: string | null; status: string | null; accountableId: string | null }[], parentOf: (r: never) => string | null) => {
    for (const r of rows) out.push({ id: r.id, level, parentId: parentOf(r as never), name: r.name, description: r.description, status: r.status, ownerId: r.accountableId });
  };
  container("workspace", ws, () => null);
  container("initiative", ini, (r: { workspaceId: string }) => r.workspaceId);
  container("program", prog, (r: { initiativeId: string }) => r.initiativeId);
  container("project", proj, (r: { programId: string }) => r.programId);
  for (const t of task) {
    out.push({
      id: t.id,
      level: "task",
      parentId: t.projectId,
      name: t.title,
      description: t.description,
      status: t.status,
      ownerId: t.responsibleId,
      priority: t.priority,
      startDate: day(t.startDate),
      dueDate: day(t.dueDate),
    });
  }
  return out;
}

// Active teammates + an in-memory version of assertAssigneeAllowed, so the
// planner can check every owner without a query per row.
export async function loadAssignment(organizationId: string, nodes: ExistingNode[]) {
  const users = await prisma.user.findMany({
    where: { organizationId, status: "active" },
    select: { id: true, email: true, roles: true, scope: true, roleAssignments: { select: { role: true, scope: true } } },
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chainIds = (a: Anchor): Set<string> => {
    const ids = new Set<string>();
    for (let cur = byId.get(a.id); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) ids.add(cur.id);
    return ids;
  };
  const scopesOf = new Map(users.map((u) => [u.id, assignmentsOfUser(u)]));

  const orgUsers: OrgUser[] = users.filter((u) => !!u.email).map((u) => ({ id: u.id, email: u.email as string }));
  const canAssign = (userId: string, anchor: Anchor | null): boolean => {
    const assignments = scopesOf.get(userId) ?? [];
    if (!anchor) return assignments.some((a) => !a.scope);
    const chain = chainIds(anchor);
    return assignments.some((a) => {
      const parsed = parseScope(a.scope);
      return !parsed || chain.has(parsed.id);
    });
  };
  return { orgUsers, canAssign, emailOfUser: new Map(users.filter((u) => u.email).map((u) => [u.id, u.email as string])) };
}

export interface ApplyResult {
  created: number;
  updated: number;
  unchanged: number;
}

// Writes a validated plan in ONE transaction (parents first). Re-checks that
// every existing id still belongs to the org inside the transaction, so a plan
// built a moment ago can't touch rows that were moved/deleted since.
export async function applyPlan(organizationId: string, plan: Plan): Promise<ApplyResult> {
  const result: ApplyResult = { created: 0, updated: 0, unchanged: 0 };
  await prisma.$transaction(
    async (tx) => {
      const fresh = await loadOrgNodesTx(tx, organizationId);
      const freshIds = new Set(fresh.map((n) => n.id));
      const freshParent = new Map(fresh.map((n) => [n.id, n.parentId]));
      const realId = new Map<string, string>(); // plan key -> DB id (created rows)
      // An untouched existing parent isn't in `realId`; its key IS its id.
      const resolve = (key: string | null): string | null => (key === null ? null : (realId.get(key) ?? (key.startsWith("new:") ? null : key)));

      for (const n of plan.nodes) {
        if (n.existingId) {
          if (!freshIds.has(n.existingId)) throw new ApiError(409, `Row ${n.rowNo}: the item no longer exists. Re-export and try again.`);
          const parentNow = freshParent.get(n.existingId) ?? null;
          if (parentNow !== resolve(n.parentKey)) throw new ApiError(409, `Row ${n.rowNo}: the item was moved since this file was exported. Re-export and try again.`);
          realId.set(n.key, n.existingId);
        }
        const parentId = resolve(n.parentKey);
        if (n.parentKey && !parentId) throw new ApiError(500, `Row ${n.rowNo}: parent wasn't resolved.`);

        if (n.existingId && !n.changed) {
          result.unchanged++;
          continue;
        }

        if (n.level === "task") {
          const data = {
            title: n.name,
            description: n.description,
            status: n.status as string,
            priority: n.priority as string,
            responsibleId: n.ownerId,
            startDate: n.startDate ? new Date(`${n.startDate}T00:00:00Z`) : null,
            dueDate: n.dueDate ? new Date(`${n.dueDate}T00:00:00Z`) : null,
          };
          if (n.existingId) await tx.task.update({ where: { id: n.existingId }, data });
          else realId.set(n.key, (await tx.task.create({ data: { ...data, projectId: parentId as string } })).id);
        } else {
          const base = { name: n.name, description: n.description, accountableId: n.ownerId };
          if (n.level === "workspace") {
            const slug = await uniqueSlug(slugify(n.name), async (c) => (await tx.workspace.count({ where: { organizationId, slug: c, ...(n.existingId ? { NOT: { id: n.existingId } } : {}) } })) > 0);
            if (n.existingId) await tx.workspace.update({ where: { id: n.existingId }, data: { ...base, slug } });
            else realId.set(n.key, (await tx.workspace.create({ data: { ...base, slug, organizationId } })).id);
          } else if (n.level === "initiative") {
            const slug = await uniqueSlug(slugify(n.name), async (c) => (await tx.initiative.count({ where: { workspaceId: parentId as string, slug: c, ...(n.existingId ? { NOT: { id: n.existingId } } : {}) } })) > 0);
            if (n.existingId) await tx.initiative.update({ where: { id: n.existingId }, data: { ...base, slug } });
            else realId.set(n.key, (await tx.initiative.create({ data: { ...base, slug, workspaceId: parentId as string } })).id);
          } else if (n.level === "program") {
            const slug = await uniqueSlug(slugify(n.name), async (c) => (await tx.program.count({ where: { initiativeId: parentId as string, slug: c, ...(n.existingId ? { NOT: { id: n.existingId } } : {}) } })) > 0);
            if (n.existingId) await tx.program.update({ where: { id: n.existingId }, data: { ...base, slug } });
            else realId.set(n.key, (await tx.program.create({ data: { ...base, slug, initiativeId: parentId as string } })).id);
          } else {
            const slug = await uniqueSlug(slugify(n.name), async (c) => (await tx.project.count({ where: { programId: parentId as string, slug: c, ...(n.existingId ? { NOT: { id: n.existingId } } : {}) } })) > 0);
            const data = { ...base, status: n.status };
            if (n.existingId) await tx.project.update({ where: { id: n.existingId }, data: { ...data, slug } });
            else realId.set(n.key, (await tx.project.create({ data: { ...data, slug, programId: parentId as string } })).id);
          }
        }
        if (n.existingId) result.updated++;
        else result.created++;
      }
    },
    { timeout: 120_000, maxWait: 10_000 }
  );
  return result;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
async function loadOrgNodesTx(tx: Tx, organizationId: string): Promise<{ id: string; parentId: string | null }[]> {
  const inOrg = { organizationId };
  const [ws, ini, prog, proj, task] = await Promise.all([
    tx.workspace.findMany({ where: inOrg, select: { id: true } }),
    tx.initiative.findMany({ where: { workspace: inOrg }, select: { id: true, workspaceId: true } }),
    tx.program.findMany({ where: { initiative: { workspace: inOrg } }, select: { id: true, initiativeId: true } }),
    tx.project.findMany({ where: { program: { initiative: { workspace: inOrg } } }, select: { id: true, programId: true } }),
    tx.task.findMany({ where: { project: { program: { initiative: { workspace: inOrg } } } }, select: { id: true, projectId: true } }),
  ]);
  return [
    ...ws.map((r) => ({ id: r.id, parentId: null })),
    ...ini.map((r) => ({ id: r.id, parentId: r.workspaceId })),
    ...prog.map((r) => ({ id: r.id, parentId: r.initiativeId })),
    ...proj.map((r) => ({ id: r.id, parentId: r.programId })),
    ...task.map((r) => ({ id: r.id, parentId: r.projectId })),
  ];
}

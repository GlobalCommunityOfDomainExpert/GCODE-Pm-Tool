// UI/server parity: the `perms` stamped on the tree (lib/auth/perms.ts, in-memory,
// drives which controls the UI shows) must agree with canOnNode() (DB-backed,
// what every write route actually enforces) for every node and user.
// Creates a throwaway org named __phase3perms_test__ and deletes it afterwards.
// Run: npx tsx scripts/test-phase3-perms.ts
// next/cache + react.cache only exist inside Next's runtime, so stub them first.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require("module");
const origLoad = Module._load;
Module._load = function (req: string, ...rest: unknown[]) {
  if (req === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidateTag() {} };
  if (req === "react") return { cache: (f: unknown) => f };
  if (req === "next/navigation") return { redirect() { throw new Error("redirect"); }, notFound() { throw new Error("notFound"); } };
  return origLoad.call(this, req, ...rest);
};

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
// Cleanup deletes ONLY the orgs this run created, by id - never by a name pattern.
const createdOrgIds: string[] = [];
const TAG = "__phase3perms_test__";
let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, extra = "") => {
  checks++;
  if (!ok) {
    failed++;
    console.log(`FAIL  ${name}  ${extra}`);
  }
};

async function main() {
  const { canOnNode, canOnOrg } = await import("../src/lib/auth/access");
  const { buildPermResolver, stampPerms } = await import("../src/lib/auth/perms");

  const org = await prisma.organization.create({ data: { name: TAG } });
  createdOrgIds.push(org.id);
  const mk = (n: string) =>
    prisma.workspace.create({
      data: {
        organizationId: org.id, name: `${TAG}${n}`, slug: `${TAG}-${n}`.toLowerCase(),
        initiatives: { create: [1, 2].map((i) => ({ name: `i${i}`, slug: `i${i}`, programs: { create: [1, 2].map((p) => ({ name: `p${p}`, slug: `p${p}`, projects: { create: [1, 2].map((j) => ({ name: `pr${j}`, slug: `pr${j}`, tasks: { create: [{ title: "t" }] } })) } })) } })) },
      },
      include: { initiatives: { include: { programs: { include: { projects: { include: { tasks: true } } } } } } },
    });
  const wsA: any = await mk("A");
  const wsB: any = await mk("B");

  const owner = await prisma.user.create({ data: { organizationId: org.id, name: "owner", email: `o@${TAG}.test`, roles: ["Team Member"], status: "active", source: "admin-invite" } });
  // one task per workspace is owned by `owner`
  await prisma.task.update({ where: { id: wsA.initiatives[0].programs[0].projects[0].tasks[0].id }, data: { responsibleId: owner.id } });

  const iA = wsA.initiatives[0], pA = iA.programs[0], prA = pA.projects[0];
  const scopes = {
    A: `workspace:${wsA.id}`, B: `workspace:${wsB.id}`,
    iA: `initiative:${iA.id}`, pA: `program:${pA.id}`, prA: `project:${prA.id}`, dangling: "workspace:does-not-exist",
  };
  const ROLES = ["Admin", "Portfolio Manager", "Program Manager", "Project Manager", "Team Member", "Client"];
  const scopeCases: (string | null)[] = [null, scopes.A, scopes.B, scopes.iA, scopes.pA, scopes.prA, scopes.dangling];
  const assignmentSets: { role: string; scope: string | null }[][] = [];
  for (const role of ROLES) for (const sc of scopeCases) assignmentSets.push([{ role, scope: sc }]);
  // multi-scope mixes
  assignmentSets.push([{ role: "Program Manager", scope: scopes.A }, { role: "Team Member", scope: scopes.B }]);
  assignmentSets.push([{ role: "Project Manager", scope: scopes.prA }, { role: "Program Manager", scope: scopes.B }]);
  assignmentSets.push([{ role: "Admin", scope: null }, { role: "Team Member", scope: scopes.A }]);
  assignmentSets.push([{ role: "Client", scope: scopes.A }, { role: "Project Manager", scope: scopes.pA }]);
  assignmentSets.push([]);

  const EDIT: Record<string, string> = {
    workspace: "Create/Edit Workspaces", initiative: "Create/Edit Initiatives", program: "Create/Edit Programs",
    project: "Create/Edit Projects", task: "Create/Edit Tasks",
  };
  const CHILD: Record<string, string | undefined> = { workspace: "initiative", initiative: "program", program: "project", project: "task" };

  const tree = async () =>
    prisma.workspace.findMany({
      where: { organizationId: org.id },
      include: { initiatives: { include: { programs: { include: { projects: { include: { tasks: true } } } } } } },
    });

  for (const assignments of assignmentSets) {
    const label = assignments.map((a) => `${a.role}@${a.scope?.split(":")[0] ?? "org"}${a.scope === scopes.A ? "A" : a.scope === scopes.B ? "B" : ""}`).join("+") || "(none)";
    for (const userId of [owner.id, "someone-else"]) {
      const user = { id: userId, organizationId: org.id, assignments };
      const resolver = await buildPermResolver(user);
      const workspaces: any[] = await tree();
      workspaces.forEach((w) => stampPerms(w, "workspace", resolver));

      const walk = async (node: any, level: string, parentKind?: string) => {
        const p = node.perms;
        const kind = level as "workspace" | "initiative" | "program" | "project";
        if (level !== "task") {
          const server = await canOnNode(user, EDIT[level] as never, kind, node.id);
          check(`${label}/${userId === owner.id ? "owner" : "other"}: ${level} edit parity`, p.edit === server, `ui=${p.edit} server=${server}`);
          check(`${label}: ${level} delete parity`, p.delete === server, `ui=${p.delete} server=${server}`);
          const childLevel = CHILD[level]!;
          // "may create a child here" = the child capability, scoped to THIS node
          const serverChild = await canOnNode(user, EDIT[childLevel] as never, kind, node.id);
          check(`${label}: ${level} createChild parity`, p.createChild === serverChild, `ui=${p.createChild} server=${serverChild}`);
        } else {
          const projectId = parentKind!;
          const full = await canOnNode(user, "Create/Edit Tasks", "project", projectId);
          const exec = await canOnNode(user, "Execute Assigned Tasks", "project", projectId);
          const isResp = node.responsibleId === user.id;
          check(`${label}/${userId === owner.id ? "owner" : "other"}: task edit parity`, p.edit === (full || isResp), `ui=${p.edit} server=${full || isResp}`);
          check(`${label}: task delete parity`, p.delete === (full || isResp), `ui=${p.delete}`);
          check(`${label}: task changeStatus parity`, p.changeStatus === (full || exec || isResp), `ui=${p.changeStatus} server=${full || exec || isResp}`);
        }
        const key = { workspace: "initiatives", initiative: "programs", program: "projects", project: "tasks" }[level] as string | undefined;
        if (!key) return;
        const childLevel = CHILD[level]!;
        for (const c of node[key]) await walk(c, childLevel, level === "project" ? node.id : undefined);
      };
      for (const w of workspaces) await walk(w, "workspace");

      // creating a workspace has no parent node: org-wide assignment required
      const server = await canOnOrg(user, "Create/Edit Workspaces");
      check(`${label}: canCreateWorkspace parity`, resolver.canCreateWorkspace === server, `ui=${resolver.canCreateWorkspace} server=${server}`);
    }
  }

  console.log(failed ? `\n${failed} FAILED of ${checks}` : `all ${checks} parity checks passed (${assignmentSets.length} access sets x 2 users x every node)`);
  process.exitCode = failed ? 1 : 0;
}

async function cleanup() {
  for (const id of createdOrgIds) {
    await prisma.workspace.deleteMany({ where: { organizationId: id } });
    await prisma.organization.delete({ where: { id } });
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

// Phase 1 checks against the dev DB. Creates a throwaway org (+ nodes) named
// __phase1_test__ and deletes it in a finally block - touches no other rows.
// Run: npx tsx scripts/test-phase1.ts
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
let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

async function main() {
  const { canOnNode } = await import("../src/lib/auth/access");
  const { scopeFilterWorkspaces } = await import("../src/lib/tree");
  const { getAllWorkspaces } = await import("../src/lib/tree");

  const tag = "__phase1_test__";
  const org0 = await prisma.organization.create({ data: { name: tag } });
  createdOrgIds.push(org0.id);
  const org = org0.id;
  const mkWs = (n: string) =>
    prisma.workspace.create({
      data: {
        organizationId: org, name: `${tag}${n}`, slug: `${tag}-${n}`.toLowerCase(),
        initiatives: { create: { name: "i", slug: "i", programs: { create: [{ name: "p", slug: "p", projects: { create: [{ name: "a", slug: "a" }, { name: "b", slug: "b" }] } }] } } },
      },
      include: { initiatives: { include: { programs: { include: { projects: true } } } } },
    });
  const wsA: any = await mkWs("A");
  const wsB: any = await mkWs("B");
  const firstProject = (w: any) => w.initiatives.flatMap((i: any) => i.programs).flatMap((p: any) => p.projects)[0];
  const pA = firstProject(wsA), pB = firstProject(wsB);
  const A = `workspace:${wsA.id}`, B = `workspace:${wsB.id}`;
  const mk = (assignments: { role: string; scope: string | null }[]) => ({ organizationId: org, assignments });

  // ---- canOnNode
  const multi = mk([{ role: "Program Manager", scope: A }, { role: "Team Member", scope: B }]);
  check("PM@A can edit tasks in A", await canOnNode(multi, "Create/Edit Tasks", "project", pA.id));
  check("PM@A / TM@B cannot edit tasks in B (TM lacks the capability)", !(await canOnNode(multi, "Create/Edit Tasks", "project", pB.id)));
  check("TM@B can execute tasks in B", await canOnNode(multi, "Execute Assigned Tasks", "project", pB.id));
  check("PM@A cannot execute tasks in A (role lacks it, TM scope is B)", !(await canOnNode(multi, "Execute Assigned Tasks", "project", pA.id)));
  check("PM@A can edit projects in A", await canOnNode(multi, "Create/Edit Projects", "program", pA.programId));
  check("PM@A cannot edit projects in B", !(await canOnNode(multi, "Create/Edit Projects", "program", pB.programId)));
  check("no assignments -> nothing", !(await canOnNode(mk([]), "Create/Edit Tasks", "project", pA.id)));
  check("Admin@org can do everything", await canOnNode(mk([{ role: "Admin", scope: null }]), "Create/Edit Tasks", "project", pB.id));
  check("ancestor is view-only: PM@project cannot edit its workspace",
    !(await canOnNode(mk([{ role: "Program Manager", scope: `project:${pA.id}` }]), "Create/Edit Workspaces", "workspace", wsA.id)));

  // ---- tree union pruning
  const all = await getAllWorkspaces(org);
  const ids = async (a: { scope: string | null }[]) => (await scopeFilterWorkspaces(structuredClone(all) as any, a)).map((w: any) => w.id).sort();
  const expectBoth = [wsA.id, wsB.id].sort();
  check("whole-org assignment sees everything", (await ids([{ scope: null }])).length === all.length);
  check("scopes A+B see exactly A and B", JSON.stringify(await ids([{ scope: A }, { scope: B }])) === JSON.stringify(expectBoth));
  check("scope A sees only A", JSON.stringify(await ids([{ scope: A }])) === JSON.stringify([wsA.id]));
  check("no assignments sees nothing", (await ids([])).length === 0);
  check("dangling scope fails closed", (await ids([{ scope: "workspace:does-not-exist" }])).length === 0);
  check("whole-org + scoped still sees everything", (await ids([{ scope: A }, { scope: null }])).length === all.length);

  // project scope: workspace -> only the one path to it, nothing else
  const [pruned]: any[] = await scopeFilterWorkspaces(structuredClone(all) as any, [{ scope: `project:${pA.id}` }]);
  const inits = pruned.initiatives;
  check("project scope: single ancestor path (1 initiative)", inits.length === 1);
  check("project scope: single program on the path", inits[0].programs.length === 1);
  check("project scope: exactly the scoped project", inits[0].programs[0].projects.length === 1 && inits[0].programs[0].projects[0].id === pA.id);

  // two project scopes in the same program -> both survive, siblings do not
  const sib = await prisma.project.findFirst({ where: { programId: pA.programId, NOT: { id: pA.id } } });
  if (sib) {
    const [p2]: any[] = await scopeFilterWorkspaces(structuredClone(all) as any, [{ scope: `project:${pA.id}` }, { scope: `project:${sib.id}` }]);
    const got = p2.initiatives.flatMap((i: any) => i.programs).flatMap((p: any) => p.projects).map((x: any) => x.id).sort();
    check("two project scopes in one program -> both, union", JSON.stringify(got) === JSON.stringify([pA.id, sib.id].sort()));
  }

  // ---- backfill parity: every user's assignments == legacy roles x scope
  const users = await prisma.user.findMany({ include: { roleAssignments: true } });
  const norm = (a: { role: string; scope: string | null }[]) => a.map((x) => `${x.role}@${x.scope ?? ""}`).sort().join("|");
  const bad = users.filter((u) => norm(u.roleAssignments) !== norm([...new Set(u.roles)].map((role) => ({ role, scope: u.scope }))));
  check(`RoleAssignment == legacy roles x scope for all ${users.length} users`, bad.length === 0);

  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exitCode = failed ? 1 : 0;
}
async function cleanup() {
  for (const id of createdOrgIds) {
    await prisma.workspace.deleteMany({ where: { organizationId: id } }); // initiatives/programs/projects cascade
    await prisma.organization.delete({ where: { id } });
  }
}
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await cleanup(); await prisma.$disconnect(); });

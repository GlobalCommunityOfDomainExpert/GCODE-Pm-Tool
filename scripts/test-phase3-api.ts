// Phase 3 API checks against a RUNNING dev server (default http://localhost:3100,
// start it with SMTP_SERVER= so no real mail is sent). Creates a throwaway org
// named __phase3_test__ (plus a second org for tenancy checks) with real
// Session rows and deletes both afterwards.
// Run: npx tsx scripts/test-phase3-api.ts
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const TAG = "__phase3_test__";
const prisma = new PrismaClient();
// Cleanup deletes ONLY the orgs this run created, by id - never by a name pattern.
const createdOrgIds: string[] = [];
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
  if (!ok) failed++;
};

type A = { role: string; scope: string | null };
async function mkUser(orgId: string, name: string, assignments: A[]) {
  const roles = [...new Set(assignments.map((a) => a.role))];
  const u = await prisma.user.create({
    data: {
      organizationId: orgId,
      name,
      email: `${name.toLowerCase()}@${TAG}.test`,
      roles,
      scope: assignments.find((a) => a.scope)?.scope ?? null,
      status: "active",
      source: "admin-invite",
    },
  });
  await prisma.roleAssignment.createMany({ data: assignments.map((a) => ({ userId: u.id, ...a })) });
  const sid = randomBytes(16).toString("hex");
  await prisma.session.create({ data: { id: sid, userId: u.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { id: u.id, cookie: `gcode_session=${sid}` };
}
const call = (cookie: string, path: string, method = "GET", body?: unknown) =>
  fetch(BASE + path, { method, redirect: "manual", headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

async function main() {
  const org = await prisma.organization.create({ data: { name: TAG } });
  createdOrgIds.push(org.id);
  const other = await prisma.organization.create({ data: { name: TAG } });
  createdOrgIds.push(other.id);
  const mkWs = (o: string, n: string) =>
    prisma.workspace.create({
      data: {
        organizationId: o,
        name: `${TAG}${n}`,
        slug: `${TAG}-${n}`.toLowerCase(),
        initiatives: { create: { name: "i", slug: "i", programs: { create: { name: "p", slug: "p", projects: { create: [{ name: "pr", slug: "pr" }] } } } } },
      },
      include: { initiatives: { include: { programs: { include: { projects: true } } } } },
    });
  const wsA: any = await mkWs(org.id, "A");
  const wsB: any = await mkWs(org.id, "B");
  const wsX: any = await mkWs(other.id, "X");
  const A = `workspace:${wsA.id}`, B = `workspace:${wsB.id}`;
  const iA = wsA.initiatives[0], pA = iA.programs[0], prA = pA.projects[0];
  const iB = wsB.initiatives[0], pB = iB.programs[0], prB = pB.projects[0];

  const admin = await mkUser(org.id, "Admin3", [{ role: "Admin", scope: null }]);
  const pm = await mkUser(org.id, "PortfolioMgr3", [{ role: "Portfolio Manager", scope: null }]);
  const progMgr = await mkUser(org.id, "ProgMgr3", [{ role: "Program Manager", scope: A }]);
  const projMgr = await mkUser(org.id, "ProjMgr3", [{ role: "Project Manager", scope: A }]);
  const oldScopedPm = await mkUser(org.id, "OldScopedPM3", [{ role: "Portfolio Manager", scope: A }]); // pre-existing bad data
  const multi = await mkUser(org.id, "Multi3", [{ role: "Program Manager", scope: A }, { role: "Team Member", scope: B }]);
  const owner = await mkUser(org.id, "Owner3", [{ role: "Client", scope: A }]); // view-only role, will own a task
  const member = await mkUser(org.id, "Member3", [{ role: "Team Member", scope: A }]);

  // ---------------- EN_020 capabilities
  let r = await call(progMgr.cookie, "/api/initiatives", "POST", { workspaceId: wsA.id, name: "ni" });
  check("EN_020: Program Manager cannot create an Initiative -> 403", r.status === 403, String(r.status));
  r = await call(progMgr.cookie, "/api/programs", "POST", { initiativeId: iA.id, name: "np" });
  check("EN_020: Program Manager can create a Program in scope -> 201", r.status === 201, String(r.status));
  r = await call(progMgr.cookie, "/api/programs", "POST", { initiativeId: iB.id, name: "np" });
  check("EN_020: Program Manager cannot create a Program outside scope -> 403", r.status === 403, String(r.status));
  r = await call(projMgr.cookie, "/api/programs", "POST", { initiativeId: iA.id, name: "np2" });
  check("EN_020: Project Manager cannot create a Program -> 403", r.status === 403, String(r.status));
  r = await call(pm.cookie, "/api/initiatives", "POST", { workspaceId: wsB.id, name: "ni2" });
  check("EN_020: Portfolio Manager can create an Initiative -> 201", r.status === 201, String(r.status));
  r = await call(pm.cookie, "/api/programs", "POST", { initiativeId: iB.id, name: "np3" });
  check("EN_020: Portfolio Manager can create a Program -> 201", r.status === 201, String(r.status));
  r = await call(admin.cookie, "/api/initiatives", "POST", { workspaceId: wsA.id, name: "ni3" });
  check("EN_020: Admin can create an Initiative -> 201", r.status === 201, String(r.status));
  const caps = await prisma.roleCapability.findMany({ where: { capability: { in: ["Create/Edit Initiatives", "Create/Edit Programs"] } } });
  const has = (role: string, c: string) => caps.some((x) => x.roleName === role && x.capability === c);
  check("EN_020: seeded matrix rows (PM: both + tasks, Program Manager: programs only, Team Member: none)",
    has("Portfolio Manager", "Create/Edit Initiatives") && has("Portfolio Manager", "Create/Edit Programs") &&
    has("Program Manager", "Create/Edit Programs") && !has("Program Manager", "Create/Edit Initiatives") && !has("Team Member", "Create/Edit Programs"));

  // ---------------- EN_019 workspace creation needs org-wide access
  r = await call(oldScopedPm.cookie, "/api/workspaces", "POST", { name: "ScopedMade" });
  check("EN_019: workspace-scoped Portfolio Manager cannot create a workspace -> 403", r.status === 403, String(r.status));
  r = await call(pm.cookie, "/api/workspaces", "POST", { name: `${TAG}PmMade` });
  const made = await r.json().catch(() => ({}));
  check("EN_019: org-wide Portfolio Manager creates a workspace -> 201", r.status === 201, String(r.status));
  const page = await (await call(pm.cookie, "/workspaces")).text();
  check("EN_019: ...and sees it in their own list", page.includes(`${TAG}PmMade`) && !!made.id);

  // ---------------- EN_021 person responsible
  const mkTask = (responsibleId: string | null, title: string) =>
    prisma.task.create({ data: { projectId: prA.id, title, responsibleId } });
  const ownTask = await mkTask(owner.id, "own");
  const otherTask = await mkTask(member.id, "someone else's");
  r = await call(owner.cookie, `/api/tasks/${ownTask.id}`, "PATCH", { title: "renamed", priority: "High", description: "d", status: "In Progress" });
  check("EN_021: view-only (Client) owner edits every field of own task -> 200", r.status === 200, String(r.status));
  r = await call(owner.cookie, `/api/tasks/${otherTask.id}`, "PATCH", { title: "hijack" });
  check("EN_021: same user cannot edit someone else's task -> 403", r.status === 403, String(r.status));
  r = await call(owner.cookie, `/api/tasks/${otherTask.id}`, "DELETE");
  check("EN_021: ...nor delete it -> 403", r.status === 403, String(r.status));
  const unassigned = await mkTask(null, "unassigned");
  r = await call(member.cookie, `/api/tasks/${unassigned.id}`, "PATCH", { title: "mine now" });
  check("EN_021: Team Member (not responsible there) still limited to status -> 403 on title", r.status === 403, String(r.status));
  r = await call(member.cookie, `/api/tasks/${unassigned.id}`, "PATCH", { status: "In Progress" });
  check("EN_021: ...but can still change its status -> 200", r.status === 200, String(r.status));
  r = await call(member.cookie, `/api/tasks/${unassigned.id}`, "DELETE");
  check("EN_021: ...and cannot delete it -> 403", r.status === 403, String(r.status));
  r = await call(owner.cookie, `/api/tasks/${ownTask.id}`, "DELETE");
  check("EN_021: owner deletes own task -> 204", r.status === 204, String(r.status));
  check("EN_021: task really deleted", (await prisma.task.count({ where: { id: ownTask.id } })) === 0);
  r = await call(member.cookie, `/api/tasks/${otherTask.id}`, "PATCH", { title: "owner edits", priority: "Low" });
  check("EN_021: the responsible Team Member edits all fields of their task -> 200", r.status === 200, String(r.status));
  const otherOrgTask = await prisma.task.create({ data: { projectId: wsX.initiatives[0].programs[0].projects[0].id, title: "x", responsibleId: member.id } });
  r = await call(member.cookie, `/api/tasks/${otherOrgTask.id}`, "PATCH", { title: "x" });
  check("EN_021: being 'responsible' never crosses orgs -> 404", r.status === 404, String(r.status));

  // ---------------- multi-scope user, over HTTP
  const tA = await prisma.task.create({ data: { projectId: prA.id, title: "tA" } });
  const tB = await prisma.task.create({ data: { projectId: prB.id, title: "tB" } });
  r = await call(multi.cookie, `/api/tasks/${tA.id}`, "PATCH", { title: "edit in A" });
  check("multi: PM@A edits a task in A -> 200", r.status === 200, String(r.status));
  r = await call(multi.cookie, `/api/tasks/${tB.id}`, "PATCH", { title: "edit in B" });
  check("multi: TM@B cannot edit title in B -> 403", r.status === 403, String(r.status));
  r = await call(multi.cookie, `/api/tasks/${tB.id}`, "PATCH", { status: "In Progress" });
  check("multi: TM@B can change status in B -> 200", r.status === 200, String(r.status));
  r = await call(multi.cookie, "/api/tasks", "POST", { projectId: prB.id, title: "new in B" });
  check("multi: cannot create a task in B (TM lacks the capability) -> 403", r.status === 403, String(r.status));
  r = await call(multi.cookie, "/api/tasks", "POST", { projectId: prA.id, title: "new in A" });
  check("multi: can create a task in A -> 201", r.status === 201, String(r.status));

  // ---------------- assignments payload (invite + edit)
  r = await call(admin.cookie, "/api/team/invite", "POST", {
    name: "Inv", email: `inv@${TAG}.test`,
    assignments: [{ role: "Program Manager", scope: A }, { role: "Team Member", scope: B }],
  });
  const inv = await r.json().catch(() => ({}));
  check("assignments: invite with 2 scoped assignments -> 201", r.status === 201, String(r.status) + JSON.stringify(inv));
  if (inv.user?.id) {
    const rows = await prisma.roleAssignment.findMany({ where: { userId: inv.user.id } });
    const u = await prisma.user.findUnique({ where: { id: inv.user.id } });
    check("assignments: both rows stored", rows.length === 2 && rows.some((x) => x.role === "Program Manager" && x.scope === A) && rows.some((x) => x.role === "Team Member" && x.scope === B));
    check("assignments: legacy roles = union, legacy scope = first scoped (never null)", u!.roles.length === 2 && u!.scope === A);
  }
  const bad = async (name: string, body: any, want: number) => {
    const res = await call(admin.cookie, "/api/team/invite", "POST", { name: "B", email: `b${Math.random().toString(36).slice(2, 7)}@${TAG}.test`, ...body });
    check(name, res.status === want, `${res.status} ${await res.text()}`);
  };
  await bad("assignments: duplicate role+scope -> 400", { assignments: [{ role: "Team Member", scope: A }, { role: "Team Member", scope: A }] }, 400);
  await bad("assignments: same role on two scopes is fine -> 201", { assignments: [{ role: "Team Member", scope: A }, { role: "Team Member", scope: B }] }, 201);
  await bad("assignments: Admin with a scope -> 400", { assignments: [{ role: "Admin", scope: A }] }, 400);
  await bad("assignments: Portfolio Manager with a scope among others -> 201 (allowed)", { assignments: [{ role: "Team Member", scope: B }, { role: "Portfolio Manager", scope: A }] }, 201);
  await bad("assignments: empty list -> 400", { assignments: [] }, 400);
  await bad("assignments: unknown role -> 400", { assignments: [{ role: "Wizard", scope: null }] }, 400);
  await bad("assignments: scope from ANOTHER org -> 404", { assignments: [{ role: "Team Member", scope: `workspace:${wsX.id}` }] }, 404);
  await bad("assignments: malformed scope -> 400", { assignments: [{ role: "Team Member", scope: "bogus" }] }, 400);
  await bad("assignments: whole-org Admin + scoped Team Member -> 201", { assignments: [{ role: "Admin", scope: null }, { role: "Team Member", scope: A }] }, 201);
  await bad("legacy payload (roles + scope) still works -> 201", { roles: ["Team Member"], scope: A }, 201);

  // edit with assignments: revoke only on a real change; order-insensitive
  const tgt = await mkUser(org.id, "Tgt3", [{ role: "Program Manager", scope: A }, { role: "Team Member", scope: B }]);
  r = await call(admin.cookie, `/api/team/users/${tgt.id}`, "PATCH", { action: "edit", assignments: [{ role: "Team Member", scope: B }, { role: "Program Manager", scope: A }] });
  const same = await r.json();
  check("edit: same assignments in a different order -> signedOut=false", r.status === 200 && same.signedOut === false, JSON.stringify(same));
  check("edit: target still signed in", (await call(tgt.cookie, "/api/team/assignable-users")).status === 200);
  r = await call(admin.cookie, `/api/team/users/${tgt.id}`, "PATCH", { action: "edit", assignments: [{ role: "Program Manager", scope: A }] });
  const chg = await r.json();
  check("edit: dropping the B assignment -> signedOut=true", r.status === 200 && chg.signedOut === true, JSON.stringify(chg));
  check("edit: target's next call -> 401", (await call(tgt.cookie, "/api/team/assignable-users")).status === 401);
  const rows = await prisma.roleAssignment.findMany({ where: { userId: tgt.id } });
  check("edit: RoleAssignment rows replaced exactly", rows.length === 1 && rows[0].role === "Program Manager" && rows[0].scope === A);

  // ---------------- team users API exposes assignments
  const list = await (await call(admin.cookie, "/api/team/users")).json();
  const m = list.find((u: any) => u.id === multi.id);
  check("GET /api/team/users returns roleAssignments for a multi-scope user", m?.roleAssignments?.length === 2);

  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
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

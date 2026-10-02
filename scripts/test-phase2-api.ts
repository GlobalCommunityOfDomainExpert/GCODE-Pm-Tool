// Phase 2 API checks against a RUNNING dev server (default http://localhost:3100,
// start it with SMTP_SERVER= so no real mail is sent). Creates a throwaway org
// named __phase2_test__ with real Session rows and deletes it afterwards.
// Run: npx tsx scripts/test-phase2-api.ts
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const TAG = "__phase2_test__";
const prisma = new PrismaClient();
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
  if (!ok) failed++;
};

async function mkUser(orgId: string, name: string, roles: string[], scope: string | null = null) {
  const u = await prisma.user.create({
    data: { organizationId: orgId, name, email: `${name.toLowerCase()}@${TAG}.test`, roles, scope, status: "active", source: "admin-invite" },
  });
  await prisma.roleAssignment.createMany({ data: roles.map((role) => ({ userId: u.id, role, scope })) });
  const sid = randomBytes(16).toString("hex");
  await prisma.session.create({ data: { id: sid, userId: u.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { id: u.id, cookie: `gcode_session=${sid}`, sid };
}
const call = (cookie: string, path: string, method = "GET", body?: unknown) =>
  fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { cookie, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

async function main() {
  const org = await prisma.organization.create({ data: { name: TAG } });
  const ws = await prisma.workspace.create({ data: { organizationId: org.id, name: `${TAG}ws`, slug: `${TAG}-ws` } });
  const scope = `workspace:${ws.id}`;
  const admin = await mkUser(org.id, "Admin1", ["Admin"]);
  const target = await mkUser(org.id, "Target1", ["Team Member"], scope);
  const bystander = await mkUser(org.id, "Bystander1", ["Team Member"], scope);

  // ---- EN_013 / EN_019 validators
  let r = await call(admin.cookie, "/api/team/invite", "POST", { name: "A", email: `a1@${TAG}.test`, roles: ["Admin"], scope });
  check("invite Admin+scope -> 400", r.status === 400, String(r.status));
  r = await call(admin.cookie, "/api/team/invite", "POST", { name: "P", email: `p1@${TAG}.test`, roles: ["Portfolio Manager"], scope });
  check("invite Portfolio Manager+scope -> 400", r.status === 400, String(r.status));
  r = await call(admin.cookie, "/api/team/invite", "POST", { name: "Mixed", email: `m1@${TAG}.test`, roles: ["Team Member", "Admin"], scope });
  check("invite [Team Member, Admin]+scope -> 400", r.status === 400, String(r.status));
  r = await call(admin.cookie, "/api/team/invite", "POST", { name: "Ok1", email: `ok1@${TAG}.test`, roles: ["Admin"] });
  const okBody = await r.json().catch(() => ({}));
  check("invite Admin whole-org -> 201", r.status === 201, String(r.status));
  r = await call(admin.cookie, "/api/team/invite", "POST", { name: "Ok2", email: `ok2@${TAG}.test`, roles: ["Program Manager"], scope });
  const ok2 = await r.json().catch(() => ({}));
  check("invite Program Manager+scope -> 201", r.status === 201, String(r.status));
  if (ok2.user?.id) {
    const ra = await prisma.roleAssignment.findMany({ where: { userId: ok2.user.id } });
    check("dual-write: invite created RoleAssignment(Program Manager@scope)", ra.length === 1 && ra[0].role === "Program Manager" && ra[0].scope === scope);
  }
  if (okBody.user?.id) {
    const ra = await prisma.roleAssignment.findMany({ where: { userId: okBody.user.id } });
    check("dual-write: whole-org Admin invite -> scope null", ra.length === 1 && ra[0].scope === null);
  }
  r = await call(admin.cookie, "/api/team/invite-codes", "POST", { roles: ["Admin"], scope });
  check("invite-code Admin+scope -> 400", r.status === 400, String(r.status));
  r = await call(admin.cookie, "/api/team/invite-codes", "POST", { roles: ["Portfolio Manager"], scope });
  check("invite-code Portfolio Manager+scope -> 400", r.status === 400, String(r.status));
  r = await call(admin.cookie, "/api/team/invite-codes", "POST", { roles: ["Team Member"], scope });
  check("invite-code Team Member+scope -> 201", r.status === 201, String(r.status));
  r = await call(admin.cookie, `/api/team/users/${target.id}`, "PATCH", { action: "edit", roles: ["Admin"], scope });
  check("edit -> Admin+scope -> 400", r.status === 400, String(r.status));
  r = await call(admin.cookie, `/api/team/users/${target.id}`, "PATCH", { action: "edit", roles: ["Portfolio Manager"], scope });
  check("edit -> Portfolio Manager+scope -> 400", r.status === 400, String(r.status));
  const still = await call(target.cookie, "/api/team/assignable-users");
  check("rejected edits did not sign the target out", still.status === 200, String(still.status));

  // ---- EN_018 revoke only on a real access change
  r = await call(admin.cookie, `/api/team/users/${target.id}`, "PATCH", { action: "edit", roles: ["Team Member"], scope });
  const same = await r.json();
  check("edit with identical access -> 200, signedOut=false", r.status === 200 && same.signedOut === false, JSON.stringify(same));
  check("identical edit leaves target signed in", (await call(target.cookie, "/api/team/assignable-users")).status === 200);

  r = await call(admin.cookie, `/api/team/users/${target.id}`, "PATCH", { action: "edit", roles: ["Project Manager"], scope });
  const chg = await r.json();
  check("edit with changed role -> 200, signedOut=true", r.status === 200 && chg.signedOut === true, JSON.stringify(chg));
  const dead = await call(target.cookie, "/api/team/assignable-users");
  check("target's next API call -> 401", dead.status === 401, String(dead.status));
  const nav = await call(target.cookie, "/workspaces");
  const loc = nav.headers.get("location") || "";
  check("target's next page load redirects to /login?reason=access-changed", nav.status >= 300 && nav.status < 400 && loc.includes("/login?reason=access-changed"), `${nav.status} ${loc}`);
  check("admin session unaffected", (await call(admin.cookie, "/api/team/users")).status === 200);
  check("other users unaffected", (await call(bystander.cookie, "/api/team/assignable-users")).status === 200);
  const ra = await prisma.roleAssignment.findMany({ where: { userId: target.id } });
  check("dual-write: edit synced RoleAssignment", ra.length === 1 && ra[0].role === "Project Manager" && ra[0].scope === scope);
  const noCookie = await call("", "/workspaces");
  check("no cookie at all -> plain /login (no reason)", (noCookie.headers.get("location") || "").endsWith("/login"), noCookie.headers.get("location") || "");

  r = await call(admin.cookie, `/api/team/users/${admin.id}`, "PATCH", { action: "edit", roles: ["Admin", "Team Member"], scope: null });
  check("admin editing own access keeps own session", r.status === 200 && (await call(admin.cookie, "/api/team/users")).status === 200);

  // ---- EN_012
  r = await call(admin.cookie, "/api/team/custom-roles", "POST", { name: "X", capabilities: [] });
  check("custom-roles POST -> 405 (create API gone)", r.status === 405, String(r.status));
  r = await call(admin.cookie, "/api/team/custom-roles");
  check("custom-roles GET still readable (existing holders)", r.status === 200, String(r.status));
  const cnt = await prisma.customRole.count({ where: { organizationId: org.id } });
  check("no custom role was created", cnt === 0);

  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exitCode = failed ? 1 : 0;
}

async function cleanup() {
  for (const o of await prisma.organization.findMany({ where: { name: TAG }, select: { id: true } })) {
    await prisma.workspace.deleteMany({ where: { organizationId: o.id } });
    await prisma.organization.delete({ where: { id: o.id } }); // users, sessions, invites, codes cascade
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

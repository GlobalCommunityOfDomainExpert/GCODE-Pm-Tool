// Phase 5 API checks (multi-organization accounts) against a RUNNING dev server
// (default http://localhost:3100, start it with SMTP_SERVER= so no real mail is sent).
// Run: npx tsx scripts/test-phase5-api.ts
// Creates throwaway orgs/users/accounts and deletes ONLY what it created, by id / exact email.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { hashToken } from "../src/lib/auth/tokens";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const TAG = "p5";
const prisma = new PrismaClient();
const createdOrgIds: string[] = [];
const createdEmails = new Set<string>(); // Accounts + pending registrations to remove, by exact email
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
  if (!ok) failed++;
};

// ---- tiny cookie jar (the app sets/clears cookies on login, switch-org and logout)
class Jar {
  c = new Map<string, string>();
  absorb(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq), value = pair.slice(eq + 1);
      const dead = value === "" || attrs.some((a) => /^max-age=0$/i.test(a) || (/^expires=/i.test(a) && new Date(a.slice(8)).getTime() < Date.now()));
      if (dead) this.c.delete(name);
      else this.c.set(name, value);
    }
  }
  header() {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}
async function http(jar: Jar, path: string, method = "GET", body?: unknown) {
  const res = await fetch(BASE + path, { method, redirect: "manual", headers: { cookie: jar.header(), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  jar.absorb(res);
  return res;
}
const login = (jar: Jar, email: string, password: string) => http(jar, "/api/auth/login", "POST", { email, password });
const hash = (pw: string) => bcrypt.hash(pw, 4); // low cost: tests only

async function mkOrg(name: string) {
  const o = await prisma.organization.create({ data: { name } });
  createdOrgIds.push(o.id);
  return o;
}
async function mkWs(orgId: string, name: string) {
  return prisma.workspace.create({ data: { organizationId: orgId, name, slug: name.toLowerCase() } });
}
async function mkUser(orgId: string, name: string, email: string, o: { role?: string; scope?: string | null; hash?: string | null; status?: string; accountId?: string | null; createdAt?: Date } = {}) {
  const role = o.role ?? "Admin";
  const scope = o.scope ?? null;
  const u = await prisma.user.create({
    data: {
      organizationId: orgId, name, email, roles: [role], scope,
      passwordHash: o.hash === undefined ? null : o.hash, status: o.status ?? "active", source: "admin-invite",
      accountId: o.accountId ?? null, ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    },
  });
  await prisma.roleAssignment.create({ data: { userId: u.id, role, scope } });
  return u;
}
async function sessionFor(userId: string) {
  const sid = randomBytes(16).toString("hex");
  await prisma.session.create({ data: { id: sid, userId, expiresAt: new Date(Date.now() + 3600_000) } });
  const jar = new Jar();
  jar.c.set("gcode_session", sid);
  return jar;
}

async function main() {
  const E = `person@${TAG}-test.example`;
  const pw = "correct-horse-1", pw3 = "different-pass-3";
  [E].forEach((e) => createdEmails.add(e));

  const o1 = await mkOrg("P5Org1"), o2 = await mkOrg("P5Org2"), o3 = await mkOrg("P5Org3"), o4 = await mkOrg("P5Org4");
  const ws1 = await mkWs(o1.id, "p5-o1-ws"), ws2 = await mkWs(o2.id, "p5-o2-ws");
  await mkWs(o4.id, "p5-o4-ws");
  const t0 = Date.now();
  // Legacy state: two memberships, same plaintext password, separate salts, NOT linked to an Account.
  const u1 = await mkUser(o1.id, "P5Person", E, { role: "Admin", hash: await hash(pw), createdAt: new Date(t0 - 5000) });
  const u2 = await mkUser(o2.id, "P5Person", E, { role: "Team Member", scope: `workspace:${ws2.id}`, hash: await hash(pw), createdAt: new Date(t0 - 4000) });
  // Same email, a DIFFERENT password (never merged).
  const u3 = await mkUser(o3.id, "P5Person", E, { role: "Admin", hash: await hash(pw3), createdAt: new Date(t0 - 3000) });
  check("setup: no Account exists for the email yet", (await prisma.account.count({ where: { email: E } })) === 0);

  // ================= login: legacy linking + picker =================
  let jar = new Jar();
  let r = await login(jar, E, "wrong-password");
  check("login: wrong password -> 401", r.status === 401, String(r.status));
  r = await login(jar, "nobody@p5-test.example", pw);
  check("login: unknown email -> 401", r.status === 401);

  jar = new Jar();
  r = await login(jar, E, pw);
  let body = await r.json();
  check("login: right password -> 200", r.status === 200, JSON.stringify(body));
  check("login: two memberships found, none remembered -> needsSelect", body.memberships === 2 && body.needsSelect === true, JSON.stringify(body));
  check("login: opens the oldest membership by default", body.id === u1.id);
  const account = await prisma.account.findUnique({ where: { email: E }, include: { users: true } });
  check("login: an Account was created lazily", !!account);
  check("login: both same-password rows linked to it", account?.users.length === 2 && account.users.some((x) => x.id === u1.id) && account.users.some((x) => x.id === u2.id));
  check("login: the different-password row was NOT merged", (await prisma.user.findUnique({ where: { id: u3.id } }))!.accountId === null);
  check("login: remembered-org cookie was set", jar.c.get("gcode_last_org") === o1.id);

  // ================= memberships + labels =================
  r = await http(jar, "/api/auth/memberships");
  const list = await r.json();
  check("memberships: lists both, current flagged", list.length === 2 && list.find((m: any) => m.current)?.userId === u1.id, JSON.stringify(list));
  const m1 = list.find((m: any) => m.userId === u1.id), m2 = list.find((m: any) => m.userId === u2.id);
  check("memberships: org-wide membership is labelled with the org name", m1.label === "P5Org1", m1.label);
  check("memberships: SCOPED membership shows the scope only, never the org name", m2.label.includes("p5-o2-ws") && !m2.label.includes("P5Org2"), m2.label);
  check("memberships: needs a session", (await http(new Jar(), "/api/auth/memberships")).status === 401);

  // ================= tenant isolation across a switch =================
  const names = async (j: Jar) => (await (await http(j, "/api/workspaces")).json()).map((w: any) => w.name).sort();
  check("isolation: org 1 session sees only org 1's workspaces", JSON.stringify(await names(jar)) === JSON.stringify(["p5-o1-ws"]));
  const oldSession = jar.c.get("gcode_session")!;
  r = await http(jar, "/api/auth/switch-org", "POST", { userId: u2.id });
  body = await r.json();
  check("switch: to the scoped membership -> 200 with its label", r.status === 200 && body.ok && body.label.includes("p5-o2-ws"), JSON.stringify(body));
  check("switch: a NEW session cookie was issued", jar.c.get("gcode_session") !== oldSession);
  const stale = new Jar(); stale.c.set("gcode_session", oldSession);
  check("switch: the old session is revoked (401)", (await http(stale, "/api/workspaces")).status === 401);
  check("isolation: after switching, only org 2's workspaces", JSON.stringify(await names(jar)) === JSON.stringify(["p5-o2-ws"]));
  check("isolation: org 2 role applies (Team Member can't manage the team)", (await http(jar, "/api/team/users")).status === 403);
  check("switch: remembered-org cookie follows", jar.c.get("gcode_last_org") === o2.id);
  r = await http(jar, "/api/auth/memberships");
  check("memberships: current moved to the new org", (await r.json()).find((m: any) => m.current)?.userId === u2.id);
  r = await http(jar, "/api/auth/switch-org", "POST", { userId: u3.id });
  check("switch: another login's membership (not on this Account) -> 404", r.status === 404, String(r.status));
  r = await http(jar, "/api/auth/switch-org", "POST", { userId: "does-not-exist" });
  check("switch: unknown id -> 404", r.status === 404);
  r = await http(jar, "/api/auth/switch-org", "POST", {});
  check("switch: no id -> 400", r.status === 400);
  r = await http(jar, "/api/auth/switch-org", "POST", { userId: u1.id });
  check("switch: back to org 1 works", r.status === 200 && JSON.stringify(await names(jar)) === JSON.stringify(["p5-o1-ws"]));
  check("switch: an unauthenticated caller can't switch", (await http(new Jar(), "/api/auth/switch-org", "POST", { userId: u1.id })).status === 401);

  // suspended membership: listed (so it can be shown disabled) but not enterable
  await prisma.user.update({ where: { id: u2.id }, data: { status: "suspended" } });
  r = await http(jar, "/api/auth/switch-org", "POST", { userId: u2.id });
  check("switch: suspended membership -> 403", r.status === 403, String(r.status));
  check("memberships: suspended one is still listed with its status", (await (await http(jar, "/api/auth/memberships")).json()).find((m: any) => m.userId === u2.id)?.status === "suspended");
  await prisma.user.update({ where: { id: u2.id }, data: { status: "active" } });

  // ================= login: remembered org + single org + conflict =================
  jar = new Jar();
  jar.c.set("gcode_last_org", o2.id);
  r = await login(jar, E, pw);
  body = await r.json();
  check("login: remembered org opens directly (no picker)", body.id === u2.id && body.needsSelect === false && body.memberships === 2, JSON.stringify(body));
  jar = new Jar();
  jar.c.set("gcode_last_org", "some-org-id-not-ours");
  body = await (await login(jar, E, pw)).json();
  check("login: a remembered org that isn't theirs is ignored -> picker", body.needsSelect === true && body.id === u1.id);

  jar = new Jar();
  r = await login(jar, E, pw3);
  body = await r.json();
  check("conflict: the other password signs into ITS membership alone", r.status === 200 && body.id === u3.id && body.memberships === 1 && body.needsSelect === false, JSON.stringify(body));
  check("conflict: still not merged into the Account", (await prisma.user.findUnique({ where: { id: u3.id } }))!.accountId === null);
  check("conflict: the Account's password was not overwritten", await bcrypt.compare(pw, (await prisma.account.findUnique({ where: { email: E } }))!.passwordHash));
  r = await http(jar, "/api/auth/memberships");
  check("conflict: standalone user sees just their one org", (await r.json()).length === 1);
  r = await http(jar, "/api/auth/switch-org", "POST", { userId: u1.id });
  check("conflict: standalone user can't switch into the other login's orgs", r.status === 404);

  // ================= orphaned Account (no memberships) is claimed, not a blocker =================
  const E2 = `orphan@${TAG}-test.example`; createdEmails.add(E2);
  await prisma.account.create({ data: { email: E2, passwordHash: await hash("some-old-password") } });
  const ue2 = await mkUser(o1.id, "P5Orphan", E2, { hash: await hash("brand-new-pass-9") });
  jar = new Jar();
  r = await login(jar, E2, "brand-new-pass-9");
  check("orphan Account: a verified login still succeeds", r.status === 200, String(r.status));
  const claimed = await prisma.account.findUnique({ where: { email: E2 } });
  check("orphan Account: claimed with the new password and linked", !!claimed && (await bcrypt.compare("brand-new-pass-9", claimed.passwordHash)) && (await prisma.user.findUnique({ where: { id: ue2.id } }))!.accountId === claimed.id);
  r = await login(new Jar(), E2, "some-old-password");
  check("orphan Account: the stale password no longer works", r.status === 401);

  // ================= status handling =================
  const E3 = `statuses@${TAG}-test.example`; createdEmails.add(E3);
  const acc3 = await prisma.account.create({ data: { email: E3, passwordHash: await hash(pw) } });
  const s1 = await mkUser(o1.id, "P5S", E3, { hash: acc3.passwordHash, accountId: acc3.id });
  const s2 = await mkUser(o2.id, "P5S", E3, { hash: acc3.passwordHash, accountId: acc3.id, status: "suspended" });
  body = await (await login(new Jar(), E3, pw)).json();
  check("status: active + suspended memberships -> signs into the active one only", body.id === s1.id && body.memberships === 1 && body.needsSelect === false, JSON.stringify(body));
  await prisma.user.update({ where: { id: s1.id }, data: { status: "suspended" } });
  r = await login(new Jar(), E3, pw);
  check("status: every membership suspended -> 403 suspended", r.status === 403 && (await r.json()).error === "suspended");
  await prisma.user.update({ where: { id: s1.id }, data: { status: "invited" } });
  await prisma.user.update({ where: { id: s2.id }, data: { status: "invited" } });
  r = await login(new Jar(), E3, pw);
  check("status: only invited memberships -> 403 pending", r.status === 403 && (await r.json()).error === "pending");

  // ================= invite into another org for an existing login =================
  const adm4 = await mkUser(o4.id, "P5Admin4", `admin4@${TAG}-test.example`);
  const admJar = await sessionFor(adm4.id);
  r = await http(admJar, "/api/team/invite", "POST", { name: "P5Person", email: E, roles: ["Team Member"] });
  const invBody = await r.json();
  check("invite: existing login invited into a new org -> 201", r.status === 201, JSON.stringify(invBody));
  const acct = (await prisma.account.findUnique({ where: { email: E } }))!;
  const invited = await prisma.user.findUnique({ where: { id: invBody.user.id } });
  check("invite: the new membership is attached to the existing Account", invited?.accountId === acct.id && invited.status === "invited" && invited.passwordHash === null);
  const raw = randomBytes(12).toString("hex");
  await prisma.user.update({ where: { id: invited!.id }, data: { inviteTokenHash: hashToken(raw), inviteTokenExpiresAt: new Date(Date.now() + 3600_000) } });
  body = await (await http(new Jar(), `/api/auth/invite/${raw}`)).json();
  check("invite page: reports a JOIN (no password needed)", body.joinExisting === true, JSON.stringify(body));
  const hashBefore = (await prisma.account.findUnique({ where: { email: E } }))!.passwordHash;
  jar = new Jar();
  r = await http(jar, "/api/auth/complete-invite", "POST", { token: raw, password: "hijack-attempt-77" });
  check("join: completes without a password", r.status === 200, String(r.status));
  check("join: a supplied password is IGNORED - the Account's password is untouched", (await prisma.account.findUnique({ where: { email: E } }))!.passwordHash === hashBefore);
  const joined = await prisma.user.findUnique({ where: { id: invited!.id } });
  check("join: membership is active, token cleared, mirrors the Account password", joined?.status === "active" && joined.inviteTokenHash === null && joined.passwordHash === hashBefore);
  check("join: signed in to the NEW org", (await names(jar)).join() === "p5-o4-ws");
  check("join: the person now has 3 memberships on one login", (await prisma.user.count({ where: { accountId: acct.id } })) === 3);
  check("join: and logs in with the unchanged password to a picker", (await (await login(new Jar(), E, pw)).json()).memberships === 3);
  r = await http(jar, "/api/auth/complete-invite", "POST", { token: raw });
  check("join: the link is single-use", r.status === 400);

  // an invite for a NEW email still needs a password
  r = await http(admJar, "/api/team/invite", "POST", { name: "Brand New", email: `brandnew@${TAG}-test.example`, roles: ["Team Member"] });
  const nb = (await r.json()).user;
  createdEmails.add(`brandnew@${TAG}-test.example`);
  check("invite: a brand-new email is NOT linked to anything", (await prisma.user.findUnique({ where: { id: nb.id } }))!.accountId === null);
  const raw2 = randomBytes(12).toString("hex");
  await prisma.user.update({ where: { id: nb.id }, data: { inviteTokenHash: hashToken(raw2), inviteTokenExpiresAt: new Date(Date.now() + 3600_000) } });
  check("invite page: a new person is NOT a join", (await (await http(new Jar(), `/api/auth/invite/${raw2}`)).json()).joinExisting === false);
  check("new account: completing without a password -> 400", (await http(new Jar(), "/api/auth/complete-invite", "POST", { token: raw2 })).status === 400);
  check("new account: short password -> 400", (await http(new Jar(), "/api/auth/complete-invite", "POST", { token: raw2, password: "short" })).status === 400);
  r = await http(new Jar(), "/api/auth/complete-invite", "POST", { token: raw2, password: "my-first-password-1" });
  check("new account: with a password -> 200", r.status === 200);
  const nbAcc = await prisma.account.findUnique({ where: { email: `brandnew@${TAG}-test.example` }, include: { users: true } });
  check("new account: an Account was created and linked", nbAcc?.users.length === 1 && nbAcc.users[0].id === nb.id && (await bcrypt.compare("my-first-password-1", nbAcc.passwordHash)));

  // ================= forgot-password: one email per Account =================
  r = await http(new Jar(), "/api/auth/forgot-password", "POST", { email: E });
  check("forgot-password: generic 200", r.status === 200);
  const members = await prisma.user.findMany({ where: { accountId: acct.id } });
  check("forgot-password: only ONE link was issued across the 3 linked memberships", members.filter((m) => m.inviteTokenHash).length === 1, String(members.filter((m) => m.inviteTokenHash).length));
  check("forgot-password: the unlinked (different-password) login got its own", !!(await prisma.user.findUnique({ where: { id: u3.id } }))!.inviteTokenHash);
  await prisma.user.updateMany({ where: { email: E }, data: { inviteTokenHash: null, inviteTokenExpiresAt: null } });

  // ================= reset: the password is the Account's =================
  const sessions = await Promise.all(members.map((m) => sessionFor(m.id)));
  const rawReset = randomBytes(12).toString("hex");
  await prisma.user.update({ where: { id: u1.id }, data: { inviteTokenHash: hashToken(rawReset), inviteTokenExpiresAt: new Date(Date.now() + 3600_000) } });
  r = await http(new Jar(), "/api/auth/complete-invite", "POST", { token: rawReset });
  check("reset: no password -> 400", r.status === 400);
  r = await http(new Jar(), "/api/auth/complete-invite", "POST", { token: rawReset, password: "a-brand-new-pass-2" });
  check("reset: with a new password -> 200", r.status === 200, String(r.status));
  const after = await prisma.account.findUnique({ where: { email: E }, include: { users: true } });
  check("reset: the Account has the new password", !!after && (await bcrypt.compare("a-brand-new-pass-2", after.passwordHash)));
  check("reset: EVERY membership mirrors it", (await Promise.all(after!.users.filter((m) => m.passwordHash).map((m) => bcrypt.compare("a-brand-new-pass-2", m.passwordHash!)))).every(Boolean));
  const stillAlive = await Promise.all(sessions.map(async (s) => (await http(s, "/api/auth/memberships")).status === 200));
  check("reset: every OTHER session on that login was signed out", stillAlive.filter(Boolean).length === 0, stillAlive.join());
  check("reset: the different-password login is untouched", await bcrypt.compare(pw3, (await prisma.user.findUnique({ where: { id: u3.id } }))!.passwordHash!));
  check("reset: old password no longer works", (await login(new Jar(), E, pw)).status === 401);
  body = await (await login(new Jar(), E, "a-brand-new-pass-2")).json();
  check("reset: new password works and lists all 3 orgs", body.memberships === 3, JSON.stringify(body));

  // ================= register an org with an email that already has a login =================
  const pwNow = "a-brand-new-pass-2";
  r = await http(new Jar(), "/api/auth/register-org", "POST", { orgName: "P5RegOrg1", name: "P5Person", email: E, password: "not-the-password-1" });
  check("register: existing login + wrong password -> 409", r.status === 409, String(r.status));
  check("register: ...and nothing pending was stored", (await prisma.pendingOrgRegistration.count({ where: { email: E } })) === 0);
  r = await http(new Jar(), "/api/auth/register-org", "POST", { orgName: "P5RegOrg1", name: "P5Person", email: E, password: pwNow });
  // The OTP email can't be sent here (SMTP disabled for tests) so the route answers 502 AFTER storing the pending row.
  const pend = await prisma.pendingOrgRegistration.findUnique({ where: { email: E } });
  check("register: existing login + right password is accepted (pending row stored)", !!pend && (r.status === 200 || r.status === 502), String(r.status));
  check("register: the new org shares the Account's password hash", pend?.passwordHash === after!.passwordHash);
  await prisma.pendingOrgRegistration.update({ where: { email: E }, data: { otpHash: hashToken("123456"), otpExpiresAt: new Date(Date.now() + 600_000), attempts: 0 } });
  r = await http(new Jar(), "/api/auth/register-org/verify-otp", "POST", { email: E, otp: "123456" });
  check("register: verifying the code creates the org", r.status === 201, String(r.status));
  const regOrg = await prisma.organization.findFirst({ where: { name: "P5RegOrg1" } });
  if (regOrg) createdOrgIds.push(regOrg.id);
  const founder = regOrg ? await prisma.user.findFirst({ where: { organizationId: regOrg.id } }) : null;
  check("register: the founder is attached to the EXISTING Account", founder?.accountId === acct.id);
  check("register: the Account now has 4 memberships and its password is unchanged", (await prisma.user.count({ where: { accountId: acct.id } })) === 4 && (await prisma.account.findUnique({ where: { email: E } }))!.passwordHash === after!.passwordHash);

  // a fresh email: Account created on registration
  const F = `fresh@${TAG}-test.example`; createdEmails.add(F);
  r = await http(new Jar(), "/api/auth/register-org", "POST", { orgName: "P5RegOrg2", name: "Fresh", email: F, password: "fresh-password-1" });
  check("register: a fresh email is accepted", r.status === 200 || r.status === 502, String(r.status));
  await prisma.pendingOrgRegistration.update({ where: { email: F }, data: { otpHash: hashToken("654321"), otpExpiresAt: new Date(Date.now() + 600_000), attempts: 0 } });
  r = await http(new Jar(), "/api/auth/register-org/verify-otp", "POST", { email: F, otp: "654321" });
  const regOrg2 = await prisma.organization.findFirst({ where: { name: "P5RegOrg2" } });
  if (regOrg2) createdOrgIds.push(regOrg2.id);
  const fAcc = await prisma.account.findUnique({ where: { email: F }, include: { users: true } });
  check("register: a fresh email gets its own Account, linked to the founder", r.status === 201 && fAcc?.users.length === 1 && (await bcrypt.compare("fresh-password-1", fAcc.passwordHash)));
  body = await (await login(new Jar(), F, "fresh-password-1")).json();
  check("register: the founder can sign in (single org -> no picker)", body.memberships === 1 && body.needsSelect === false);

  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exitCode = failed ? 1 : 0;
  void ws1;
}

async function cleanup() {
  for (const email of createdEmails) {
    await prisma.pendingOrgRegistration.deleteMany({ where: { email } });
  }
  for (const id of createdOrgIds) {
    await prisma.workspace.deleteMany({ where: { organizationId: id } });
    await prisma.organization.delete({ where: { id } }).catch(() => {});
  }
  for (const email of createdEmails) {
    await prisma.account.deleteMany({ where: { email } });
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

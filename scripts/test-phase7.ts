// Phase 7 checks (EN_002 limits, EN_010 confirm modals, EN_008 live refresh) against a
// RUNNING dev server (default http://localhost:3100, start it with SMTP_SERVER= so no
// real mail is sent). Needs Playwright, which is not a project dependency:
//   NODE_PATH=<dir>/node_modules npx tsx scripts/test-phase7.ts
// Creates a throwaway org and deletes ONLY that org, by id.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const TAG = "__phase7_test__";
const prisma = new PrismaClient();
// Cleanup deletes ONLY the orgs this run created, by id - never by a name pattern.
const createdOrgIds: string[] = [];
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
  if (!ok) failed++;
};

async function mkUser(orgId: string, name: string, role = "Admin") {
  const u = await prisma.user.create({
    data: { organizationId: orgId, name, email: `${name.toLowerCase()}@${TAG}.test`, roles: [role], scope: null, status: "active", source: "admin-invite" },
  });
  await prisma.roleAssignment.create({ data: { userId: u.id, role, scope: null } });
  const sid = randomBytes(16).toString("hex");
  await prisma.session.create({ data: { id: sid, userId: u.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { id: u.id, sid, cookie: `gcode_session=${sid}` };
}
const call = (cookie: string, path: string, method = "GET", body?: unknown) =>
  fetch(BASE + path, { method, headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

async function main() {
  const org = await prisma.organization.create({ data: { name: TAG } });
  createdOrgIds.push(org.id);
  const LONG80 = "L".repeat(80);
  const ws = await prisma.workspace.create({
    data: {
      organizationId: org.id, name: LONG80, slug: "long-ws",
      initiatives: { create: { name: "i", slug: "i", programs: { create: { name: "p", slug: "p", projects: { create: { name: "pr", slug: "pr", tasks: { create: [{ title: "T".repeat(60) }] } } } } } } },
    },
    include: { initiatives: { include: { programs: { include: { projects: true } } } } },
  });
  const ini = ws.initiatives[0], prog = ini.programs[0], proj = prog.projects[0];
  const admin = await mkUser(org.id, "P7Admin");
  const t1 = await mkUser(org.id, "P7Target1", "Team Member");
  const t2 = await mkUser(org.id, "P7Target2", "Team Member");

  // ================= EN_002: server limits =================
  const n60 = "a".repeat(60), n61 = "a".repeat(61), d255 = "d".repeat(255), d256 = "d".repeat(256);
  const post = async (path: string, extra: object, body: object) => (await call(admin.cookie, path, "POST", { ...extra, ...body })).status;
  const targets: [string, object, string][] = [
    ["/api/workspaces", {}, "name"],
    ["/api/initiatives", { workspaceId: ws.id }, "name"],
    ["/api/programs", { initiativeId: ini.id }, "name"],
    ["/api/projects", { programId: prog.id }, "name"],
    ["/api/tasks", { projectId: proj.id }, "title"],
  ];
  for (const [path, extra, key] of targets) {
    const lvl = path.split("/").pop();
    check(`limit: ${lvl} ${key} of 61 chars -> 400`, (await post(path, extra, { [key]: n61 })) === 400);
    check(`limit: ${lvl} ${key} of 60 chars -> 201`, (await post(path, extra, { [key]: n60 })) === 201);
    check(`limit: ${lvl} description of 256 chars -> 400`, (await post(path, extra, { [key]: "ok", description: d256 })) === 400);
    check(`limit: ${lvl} description of 255 chars -> 201`, (await post(path, extra, { [key]: "ok", description: d255 })) === 201);
  }
  const r = await call(admin.cookie, "/api/workspaces", "POST", { name: n61 });
  check("limit: error message names the limit", (await r.json()).error?.includes("60"));
  check("limit: 60 emoji (2 UTF-16 units each) count as 60 -> 201", (await post("/api/workspaces", {}, { name: "😀".repeat(60) })) === 201);
  check("limit: 61 emoji -> 400", (await post("/api/workspaces", {}, { name: "😀".repeat(61) })) === 400);
  const wsId = ws.id, taskId = (await prisma.task.findFirst({ where: { projectId: proj.id } }))!.id;
  const patch = async (path: string, body: object) => (await call(admin.cookie, path, "PATCH", body)).status;
  check("limit: PATCH workspace name 61 -> 400", (await patch(`/api/workspaces/${wsId}`, { name: n61 })) === 400);
  check("limit: PATCH workspace description 256 -> 400", (await patch(`/api/workspaces/${wsId}`, { description: d256 })) === 400);
  check("limit: PATCH touching only description is NOT blocked by an old 80-char name -> 200", (await patch(`/api/workspaces/${wsId}`, { description: "fine" })) === 200);
  check("limit: PATCH task title 61 -> 400", (await patch(`/api/tasks/${taskId}`, { title: n61 })) === 400);
  check("limit: PATCH task status only (old 60-char title) -> 200", (await patch(`/api/tasks/${taskId}`, { status: "In Progress" })) === 200);
  check("limit: PATCH initiative/program/project name 61 -> 400",
    (await patch(`/api/initiatives/${ini.id}`, { name: n61 })) === 400 &&
    (await patch(`/api/programs/${prog.id}`, { name: n61 })) === 400 &&
    (await patch(`/api/projects/${proj.id}`, { name: n61 })) === 400);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addCookies([{ name: "gcode_session", value: admin.sid, url: BASE }]);
  const page = await ctx.newPage();
  const nativeDialogs: string[] = [];
  page.on("dialog", async (d: any) => { nativeDialogs.push(d.message()); await d.dismiss(); });
  await page.goto(`${BASE}/workspaces`, { waitUntil: "networkidle" });

  // ================= EN_002: form + display =================
  await page.getByRole("button", { name: /New Workspace/ }).click();
  const nameInput = page.getByPlaceholder("e.g. Workspace name");
  check("form: name input has maxLength 60", (await nameInput.getAttribute("maxlength")) === "60");
  check("form: counters start at 0/60 and 0/255", (await page.getByTestId("char-counter").allTextContents()).join(",") === "0/60,0/255");
  await nameInput.fill("x".repeat(70));
  check("form: typing 70 chars is cut to 60", (await nameInput.inputValue()).length === 60);
  check("form: counter shows 60/60", (await page.getByTestId("char-counter").first().textContent()) === "60/60");
  check("form: counter turns red when full", (await page.getByTestId("char-counter").first().getAttribute("class"))!.includes("text-danger"));
  const desc = page.locator("textarea").first();
  check("form: description has maxLength 255", (await desc.getAttribute("maxlength")) === "255");
  await page.keyboard.press("Escape");

  const card = page.locator("h3", { hasText: "LLLL" }).first();
  check("display: long workspace name has a full-name tooltip", (await card.getAttribute("title")) === LONG80);
  check("display: long workspace name is ellipsised (truncated)", await card.evaluate((el: HTMLElement) => el.scrollWidth > el.clientWidth));

  // ================= EN_008: live refresh =================
  const hasCard = (name: string) => page.locator("h3", { hasText: name });
  await call(admin.cookie, "/api/workspaces", "POST", { name: "LiveOne" });
  check("live: a new workspace from another session is NOT there before any refresh", (await hasCard("LiveOne").count()) === 0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await hasCard("LiveOne").first().waitFor({ timeout: 8000 }).catch(() => {});
  check("live: ...and shows up when the tab regains focus", (await hasCard("LiveOne").count()) === 1);

  // paused while a modal is open
  await page.getByRole("button", { name: /New Workspace/ }).click();
  await call(admin.cookie, "/api/workspaces", "POST", { name: "LiveTwo" });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(2500);
  check("live: refresh is paused while the create modal is open", (await hasCard("LiveTwo").count()) === 0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await hasCard("LiveTwo").first().waitFor({ timeout: 8000 }).catch(() => {});
  check("live: ...and catches up after the modal closes", (await hasCard("LiveTwo").count()) === 1);

  // the 30s poll itself (no focus event)
  await call(admin.cookie, "/api/workspaces", "POST", { name: "LivePoll" });
  await hasCard("LivePoll").first().waitFor({ timeout: 40000 }).catch(() => {});
  check("live: the 30s poll picks up changes with no focus event", (await hasCard("LivePoll").count()) === 1);

  // kanban board
  await page.goto(`${BASE}/workspaces/long-ws/i/p/pr`, { waitUntil: "networkidle" });
  const titleCard = page.getByText("T".repeat(60), { exact: true }).first();
  check("display: kanban task title carries a tooltip", (await titleCard.getAttribute("title")) === "T".repeat(60));
  await call(admin.cookie, "/api/tasks", "POST", { projectId: proj.id, title: "LiveTask" });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText("LiveTask", { exact: true }).waitFor({ timeout: 8000 }).catch(() => {});
  check("live: board picks up a task created elsewhere on focus", (await page.getByText("LiveTask", { exact: true }).count()) === 1);

  // team directory (silent reload, no spinner needed)
  await page.goto(`${BASE}/team`, { waitUntil: "networkidle" });
  await call(admin.cookie, "/api/team/invite", "POST", { name: "LiveInvitee", email: "liveinvitee@phase7-test.example", roles: ["Team Member"] });
  check("live: invite from another session not visible yet", (await page.locator("tr", { hasText: "LiveInvitee" }).count()) === 0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.locator("tr", { hasText: "LiveInvitee" }).first().waitFor({ timeout: 8000 }).catch(() => {});
  check("live: directory shows the new invitee after focus", (await page.locator("tr", { hasText: "LiveInvitee" }).count()) === 1);

  // ================= EN_010: confirm modals =================
  const row = (n: string) => page.locator("tr", { hasText: n });
  await row("P7Target1").getByText("⋮").click();
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page.getByText("Deactivate user?").waitFor({ timeout: 5000 }).catch(() => {});
  check("confirm: Deactivate opens an in-app modal", (await page.getByText("Deactivate user?").count()) === 1);
  check("confirm: modal names the person", (await page.getByText(/Deactivate P7Target1\?/).count()) === 1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  check("confirm: Cancel changes nothing", (await prisma.user.findUnique({ where: { id: t1.id } }))!.status === "active");
  await row("P7Target1").getByText("⋮").click();
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page.getByRole("button", { name: "Deactivate", exact: true }).last().click();
  await page.locator('[data-tone="success"]', { hasText: "deactivated" }).waitFor({ timeout: 8000 }).catch(() => {});
  check("confirm: confirming deactivates", (await prisma.user.findUnique({ where: { id: t1.id } }))!.status === "suspended");

  await row("P7Target2").getByText("⋮").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  check("confirm: Delete opens an in-app modal", (await page.getByText("Remove teammate?").count()) === 1);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.locator('[data-tone="success"]', { hasText: "removed" }).waitFor({ timeout: 8000 }).catch(() => {});
  check("confirm: confirming removes the teammate", (await prisma.user.count({ where: { id: t2.id } })) === 0);

  await page.getByRole("button", { name: "Invite Codes" }).click();
  await page.getByLabel("Role").selectOption("Team Member");
  await page.getByRole("button", { name: "Generate Code" }).click();
  await page.getByRole("button", { name: "Revoke", exact: true }).first().waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Revoke", exact: true }).first().click();
  check("confirm: Revoke opens an in-app modal", (await page.getByText("Revoke invite code?").count()) === 1);
  await page.getByRole("button", { name: "Revoke", exact: true }).last().click();
  await page.locator('[data-tone="success"]', { hasText: "revoked" }).waitFor({ timeout: 8000 }).catch(() => {});
  check("confirm: confirming revokes the code", (await prisma.inviteCode.count({ where: { organizationId: org.id, revoked: true } })) === 1);
  check("confirm: no native browser dialog was ever shown", nativeDialogs.length === 0, nativeDialogs.join("|"));

  await browser.close();
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

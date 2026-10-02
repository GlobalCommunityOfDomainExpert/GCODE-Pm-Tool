// Phase 2 browser checks against a RUNNING dev server (default http://localhost:3100,
// start it with SMTP_SERVER= so no real mail is sent). Needs Playwright, which is
// not a project dependency - install it elsewhere and point NODE_PATH at it:
//   NODE_PATH=<dir>/node_modules npx tsx scripts/test-phase2-ui.ts
// Creates a throwaway org named __phase2ui_test__ (real Session rows) and deletes it afterwards.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const TAG = "__phase2ui_test__";
const LONG_NAME = "My Name is Lavya, I am an BE graduate from CU and this workspace name is deliberately far too long to fit a breadcrumb";
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
  return { id: u.id, sid };
}

async function main() {
  const org = await prisma.organization.create({ data: { name: TAG } });
  const longWs = await prisma.workspace.create({ data: { organizationId: org.id, name: LONG_NAME, slug: "long-name-ws" } });
  const scope = `workspace:${longWs.id}`;
  const admin = await mkUser(org.id, "UiAdmin", ["Admin"]);
  const member = await mkUser(org.id, "UiMember", ["Team Member"], scope);
  const victim = await mkUser(org.id, "UiVictim", ["Team Member"], scope);

  const browser = await chromium.launch();
  const ctxFor = async (sid: string, width = 1280) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    await ctx.addCookies([{ name: "gcode_session", value: sid, url: BASE }]);
    return ctx;
  };
  const toast = (page: any) => page.locator('[data-testid="toast-region"] [role]');

  // ---------------- EN_003 breadcrumb (1000px, long name)
  {
    const page = await (await ctxFor(admin.sid, 1000)).newPage();
    await page.goto(`${BASE}/workspaces/long-name-ws`, { waitUntil: "networkidle" });
    const crumb = page.locator('nav[aria-label="Breadcrumb"] [aria-current="page"]');
    check("breadcrumb: last crumb has title = full name", (await crumb.getAttribute("title")) === LONG_NAME);
    const dims = await crumb.evaluate((el: HTMLElement) => ({ sw: el.scrollWidth, cw: el.clientWidth, ch: el.textContent!.length }));
    check("breadcrumb: text is visually truncated (ellipsis)", dims.sw > dims.cw, JSON.stringify(dims));
    const cwChars = await crumb.evaluate((el: HTMLElement) => el.getBoundingClientRect().width / parseFloat(getComputedStyle(el).fontSize));
    check("breadcrumb: visible width ~<= 24ch (<= 24em)", cwChars <= 24.5, String(cwChars));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check("breadcrumb: no horizontal page overflow at 1000px", !overflow);
    await crumb.focus();
    check("breadcrumb: current crumb is keyboard-focusable", await crumb.evaluate((el: HTMLElement) => document.activeElement === el));
    await page.context().close();
  }

  // ---------------- EN_005 / EN_017 toasts: create -> edit -> delete (admin)
  {
    const page = await (await ctxFor(admin.sid)).newPage();
    await page.goto(`${BASE}/workspaces`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /New Workspace/ }).click();
    await page.getByPlaceholder("e.g. Workspace name").fill("Toast WS");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    let t = page.locator('[data-tone="success"]', { hasText: "Workspace created." });
    await t.waitFor({ timeout: 8000 }).catch(() => {});
    check("create workspace -> success toast 'Workspace created.'", (await t.count()) === 1);
    check("success toast has role=status (screen-reader polite)", (await t.getAttribute("role")) === "status");
    check("toast region is aria-live=polite", (await page.locator('[data-testid="toast-region"]').getAttribute("aria-live")) === "polite");

    const card = () => page.locator('xpath=//*[contains(text(),"Toast WS")]/ancestor::*[.//*[@aria-label="Item actions"]][1]');
    await card().locator('[aria-label="Item actions"]').first().click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByPlaceholder("e.g. Workspace name").fill("Toast WS renamed");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    t = page.locator('[data-tone="success"]', { hasText: "Workspace updated." });
    await t.waitFor({ timeout: 8000 }).catch(() => {});
    check("rename workspace -> success toast 'Workspace updated.'", (await t.count()) >= 1);

    await page.locator('xpath=//*[contains(text(),"Toast WS renamed")]/ancestor::*[.//*[@aria-label="Item actions"]][1]').locator('[aria-label="Item actions"]').first().click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).last().click();
    t = page.locator('[data-tone="success"]', { hasText: "Workspace deleted." });
    await t.waitFor({ timeout: 8000 }).catch(() => {});
    check("delete workspace -> success toast 'Workspace deleted.'", (await t.count()) >= 1);
    check("delete: card is gone", (await page.getByText("Toast WS renamed").count()) === 0);

    // stacking: two toasts at once
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("gcode:action-toast", { detail: { message: "one", tone: "success" } }));
      window.dispatchEvent(new CustomEvent("gcode:action-toast", { detail: { message: "two", tone: "danger" } }));
    });
    check("toasts stack (>1 visible at once)", (await toast(page).count()) >= 2);
    const danger = page.locator('[data-tone="danger"]', { hasText: "two" });
    check("error toast has role=alert", (await danger.getAttribute("role")) === "alert");
    await page.context().close();
  }

  // ---------------- error toast still works: scoped Team Member -> 403
  {
    const page = await (await ctxFor(member.sid)).newPage();
    await page.goto(`${BASE}/workspaces`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /New Workspace/ }).click();
    await page.getByPlaceholder("e.g. Workspace name").fill("Nope");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    const t = page.locator('[data-tone="danger"]', { hasText: "Action blocked" });
    await t.waitFor({ timeout: 8000 }).catch(() => {});
    check("403 on create -> error toast 'Action blocked: ...'", (await t.count()) === 1, (await toast(page).allTextContents()).join("|"));
    check("no success toast on a failed create", (await page.locator('[data-tone="success"]').count()) === 0);
    await page.context().close();
  }

  // ---------------- EN_018: 401 mid-session -> toast + redirect with message
  {
    const page = await (await ctxFor(victim.sid)).newPage();
    await page.goto(`${BASE}/workspaces`, { waitUntil: "networkidle" });
    await prisma.session.updateMany({ where: { userId: victim.id }, data: { revokedAt: new Date() } }); // what an admin edit does
    await page.getByRole("button", { name: /New Workspace/ }).click();
    await page.getByPlaceholder("e.g. Workspace name").fill("Late");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(/\/login\?reason=access-changed/, { timeout: 10000 }).catch(() => {});
    check("401 mid-session -> redirected to /login?reason=access-changed", page.url().includes("/login?reason=access-changed"), page.url());
    const note = page.getByRole("status").filter({ hasText: "session ended" });
    await note.waitFor({ timeout: 5000 }).catch(() => {});
    check("login page explains why they were signed out", (await note.count()) === 1);
    await page.context().close();
  }

  // ---------------- EN_012 + EN_013 UI + toasts on /team (admin)
  {
    const page = await (await ctxFor(admin.sid)).newPage();
    await page.goto(`${BASE}/team`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Role Definitions" }).click();
    await page.getByText("Role Permissions Matrix").waitFor();
    check("EN_012: no 'Custom Roles' heading", (await page.getByText("Custom Roles").count()) === 0);
    check("EN_012: no '+ Create Custom Role' button", (await page.getByText("Create Custom Role").count()) === 0);
    check("EN_012: built-in matrix still shown (all 5 role columns)", (await page.locator("th", { hasText: /^(Admin|Portfolio Manager|Program Manager|Project Manager|Team Member)$/ }).count()) === 5);

    await page.getByRole("button", { name: "Directory & Assignments" }).click();
    await page.getByRole("button", { name: "+ Invite User" }).click();
    check("EN_013: scope selectable for Team Member (not locked)", (await page.locator('[data-testid="scope-locked"]').count()) === 0);
    await page.getByRole("button", { name: "Admin", exact: true }).click();
    check("EN_013: picking Admin locks scope to Whole Org", (await page.locator('[data-testid="scope-locked"]').count()) === 1);
    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await page.getByRole("button", { name: "Portfolio Manager", exact: true }).click();
    check("EN_019: picking Portfolio Manager locks scope", (await page.locator('[data-testid="scope-locked"]').count()) === 1);
    await page.keyboard.press("Escape");

    // edit a user -> success toast (identical access, so no sign-out wording)
    await page.reload({ waitUntil: "networkidle" });
    const row = page.locator("tr", { hasText: "UiMember" });
    await row.getByText("⋮").click();
    await page.getByRole("button", { name: /^Edit/ }).first().click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const t = page.locator('[data-tone="success"]', { hasText: "UiMember updated." });
    await t.waitFor({ timeout: 8000 }).catch(() => {});
    check("edit teammate -> success toast", (await t.count()) === 1, (await toast(page).allTextContents()).join("|"));

    // invite codes tab: generate -> toast; Admin locks scope there too
    await page.getByRole("button", { name: "Invite Codes" }).click();
    await page.getByLabel("Role").selectOption("Admin");
    check("EN_013: invite-code form locks scope for Admin", (await page.locator('[data-testid="scope-locked"]').count()) === 1);
    await page.getByLabel("Role").selectOption("Team Member");
    await page.getByRole("button", { name: "Generate Code" }).click();
    const gen = page.locator('[data-tone="success"]', { hasText: "Invite code generated." });
    await gen.waitFor({ timeout: 8000 }).catch(() => {});
    check("generate invite code -> success toast", (await gen.count()) === 1);
    await page.context().close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exitCode = failed ? 1 : 0;
}

async function cleanup() {
  for (const o of await prisma.organization.findMany({ where: { name: TAG }, select: { id: true } })) {
    await prisma.workspace.deleteMany({ where: { organizationId: o.id } });
    await prisma.organization.delete({ where: { id: o.id } });
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

// Phase 5 browser checks (multi-organization login, picker, switcher, join page) against a
// RUNNING dev server (default http://localhost:3100, start it with SMTP_SERVER=).
// Needs Playwright, which is not a project dependency:
//   NODE_PATH=<dir>/node_modules npx tsx scripts/test-phase5-ui.ts
// Creates throwaway orgs/users/accounts and deletes ONLY those, by id / exact email.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { hashToken } from "../src/lib/auth/tokens";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const prisma = new PrismaClient();
let browserRef: { close: () => Promise<void> } | null = null;
const createdOrgIds: string[] = [];
const createdEmails = new Set<string>();
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
  if (!ok) failed++;
};

async function main() {
  const pw = "ui-password-123";
  const hash = await bcrypt.hash(pw, 4);
  const mkOrg = async (name: string) => {
    const o = await prisma.organization.create({ data: { name } });
    createdOrgIds.push(o.id);
    return o;
  };
  const mkWs = (orgId: string, name: string) => prisma.workspace.create({ data: { organizationId: orgId, name, slug: name.toLowerCase().replace(/\s+/g, "-") } });
  const mkUser = async (orgId: string, name: string, email: string, accountId: string | null, o: { role?: string; scope?: string | null; status?: string; hash?: string | null } = {}) => {
    const role = o.role ?? "Admin";
    const u = await prisma.user.create({
      data: { organizationId: orgId, name, email, roles: [role], scope: o.scope ?? null, passwordHash: o.hash === undefined ? hash : o.hash, status: o.status ?? "active", source: "admin-invite", accountId },
    });
    await prisma.roleAssignment.create({ data: { userId: u.id, role, scope: o.scope ?? null } });
    return u;
  };

  const A = await mkOrg("P5uiAcme"), B = await mkOrg("P5uiBeta"), C = await mkOrg("P5uiGamma"), D = await mkOrg("P5uiDelta"), S = await mkOrg("P5uiSolo");
  await mkWs(A.id, "Acme Workspace");
  const wsB = await mkWs(B.id, "Beta Workspace");
  await mkWs(C.id, "Gamma Workspace");
  await mkWs(D.id, "Delta Workspace");
  await mkWs(S.id, "Solo Workspace");

  const E = "multi@p5ui-test.example";
  createdEmails.add(E);
  const acc = await prisma.account.create({ data: { email: E, passwordHash: hash } });
  const mA = await mkUser(A.id, "Multi Person", E, acc.id, { role: "Admin" });
  await new Promise((r) => setTimeout(r, 30));
  const mB = await mkUser(B.id, "Multi Person", E, acc.id, { role: "Team Member", scope: `workspace:${wsB.id}` });

  const SOLO = "solo@p5ui-test.example";
  createdEmails.add(SOLO);
  const sAcc = await prisma.account.create({ data: { email: SOLO, passwordHash: hash } });
  await mkUser(S.id, "Solo Person", SOLO, sAcc.id, { role: "Admin" });

  const browser = await chromium.launch();
  browserRef = browser;
  const fresh = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    return { ctx, page: await ctx.newPage() };
  };
  const signIn = async (page: any, email: string) => {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("you@company.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(pw);
    await page.getByRole("button", { name: "Sign In" }).click();
  };

  // ================= login with several organizations -> picker =================
  {
    const { ctx, page } = await fresh();
    await signIn(page, E);
    await page.waitForURL(/\/select-org/, { timeout: 15000 }).catch(() => {});
    check("login: several organizations and none remembered -> /select-org", page.url().includes("/select-org"), page.url());
    await page.getByTestId("org-option").first().waitFor({ timeout: 8000 }).catch(() => {});
    const labels = await page.getByTestId("org-option").allTextContents();
    check("picker: lists both organizations", labels.length === 2, labels.join("|"));
    check("picker: org-wide membership shows the org name", labels.some((l: string) => l.includes("P5uiAcme")), labels.join("|"));
    check("picker: SCOPED membership shows the scope, never the org name", labels.some((l: string) => l.includes("Beta Workspace")) && !labels.some((l: string) => l.includes("P5uiBeta")), labels.join("|"));
    await page.getByTestId("org-option").filter({ hasText: "P5uiAcme" }).click();
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    check("picker: choosing an org opens it", page.url().endsWith("/workspaces"), page.url());
    await page.getByText("Acme Workspace", { exact: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
    check("picker: lands in that org's data", (await page.getByText("Acme Workspace", { exact: true }).count()) >= 1 && (await page.getByText("Beta Workspace", { exact: true }).count()) === 0);

    // ---- switcher in the account menu
    await page.getByTestId("account-badge").click();
    const sw = page.getByTestId("org-switcher");
    check("switcher: the account menu shows 'Switch organization'", (await sw.count()) === 1 && (await sw.getByText("Switch organization").count()) === 1);
    check("switcher: lists both memberships", (await sw.getByTestId("org-option").count()) === 2);
    check("switcher: the current org is marked", (await sw.locator('[data-current="true"]').count()) === 1 && (await sw.locator('[data-current="true"]').textContent())!.includes("P5uiAcme"));
    await page.keyboard.press("Escape");
    check("switcher: Esc closes the menu", (await page.getByRole("menu").count()) === 0);

    await page.getByTestId("account-badge").click();
    await page.getByTestId("org-option").filter({ hasText: "Beta Workspace" }).click();
    const toast = page.locator('[data-tone="success"]', { hasText: "Switched to" });
    await toast.waitFor({ timeout: 8000 }).catch(() => {});
    check("switcher: success toast 'Switched to ...'", (await toast.count()) === 1, (await page.locator('[data-testid="toast-region"]').textContent()) || "");
    await page.getByText("Beta Workspace", { exact: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
    check("switcher: the page now shows the OTHER org's workspaces", (await page.getByText("Beta Workspace", { exact: true }).count()) >= 1 && (await page.getByText("Acme Workspace", { exact: true }).count()) === 0);
    check("switcher: scoped membership -> header does not reveal the org name", (await page.locator("header").getByText("P5uiBeta").count()) === 0);
    check("switcher: URL reset to /workspaces (slugs are per org)", page.url().endsWith("/workspaces"));
    await page.getByTestId("account-badge").click();
    check("switcher: current marker moved", (await page.locator('[data-current="true"]').textContent())!.includes("Beta Workspace"));
    await page.keyboard.press("Escape");

    // ---- sign out, sign in again: the remembered org opens straight away
    await page.getByTestId("account-badge").click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {});
    await signIn(page, E);
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    check("login again: the last-used org opens directly (no picker)", page.url().endsWith("/workspaces") && (await page.getByText("Beta Workspace", { exact: true }).count()) >= 1, page.url());
    await ctx.close();
  }

  // ================= single-org login: no picker, no switcher =================
  {
    const { ctx, page } = await fresh();
    await signIn(page, SOLO);
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    check("single org: login goes straight to /workspaces", page.url().endsWith("/workspaces"), page.url());
    await page.getByTestId("account-badge").click();
    check("single org: no 'Switch organization' section", (await page.getByTestId("org-switcher").count()) === 0);
    await page.keyboard.press("Escape");
    await page.goto(`${BASE}/select-org`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/workspaces$/, { timeout: 10000 }).catch(() => {});
    check("single org: a bookmarked /select-org just continues into the app", page.url().endsWith("/workspaces"), page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh();
    // This page deliberately bounces to /login mid-load, so "network idle" is the wrong condition.
    await page.goto(`${BASE}/select-org`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {});
    check("select-org: needs a session -> back to /login", page.url().includes("/login"), page.url());
    await ctx.close();
  }

  // ================= invited / suspended memberships are shown but disabled =================
  const cGamma = await mkUser(C.id, "Multi Person", E, acc.id, { role: "Team Member", status: "invited", hash: null });
  const cDelta = await mkUser(D.id, "Multi Person", E, acc.id, { role: "Team Member", status: "suspended" });
  {
    const { ctx, page } = await fresh();
    await signIn(page, E);
    await page.waitForURL(/\/select-org/, { timeout: 15000 }).catch(() => {});
    await page.getByTestId("org-option").first().waitFor({ timeout: 8000 }).catch(() => {});
    const opts = page.getByTestId("org-option");
    check("disabled: all four memberships are listed", (await opts.count()) === 4);
    const inv = opts.filter({ hasText: "P5uiGamma" }), sus = opts.filter({ hasText: "P5uiDelta" });
    check("disabled: invited one is greyed out and labelled", (await inv.isDisabled()) && (await inv.textContent())!.includes("(invited)"));
    check("disabled: suspended one is greyed out and labelled", (await sus.isDisabled()) && (await sus.textContent())!.includes("(suspended)"));
    await opts.filter({ hasText: "P5uiAcme" }).click();
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    await page.getByTestId("account-badge").click();
    const menuOpts = page.getByTestId("org-switcher").getByTestId("org-option");
    check("disabled: the menu lists them too, disabled", (await menuOpts.count()) === 4 && (await menuOpts.filter({ hasText: "P5uiDelta" }).isDisabled()));
    await ctx.close();
  }
  await prisma.user.deleteMany({ where: { id: { in: [cGamma.id, cDelta.id] } } });

  // ================= invite page: joining an existing login =================
  const joinUser = await prisma.user.create({
    data: { organizationId: C.id, name: "Multi Person", email: E, roles: ["Team Member"], status: "invited", source: "admin-invite", accountId: acc.id },
  });
  await prisma.roleAssignment.create({ data: { userId: joinUser.id, role: "Team Member", scope: null } });
  await prisma.invite.create({ data: { userId: joinUser.id, name: "Multi Person", email: E, roles: ["Team Member"], scope: null, status: "pending", invitedByName: "Ann Admin", invitedByRole: "Admin" } });
  const raw = randomBytes(12).toString("hex");
  await prisma.user.update({ where: { id: joinUser.id }, data: { inviteTokenHash: hashToken(raw), inviteTokenExpiresAt: new Date(Date.now() + 3600_000) } });
  {
    const { ctx, page } = await fresh();
    await page.goto(`${BASE}/invite/${raw}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Join / }).waitFor({ timeout: 8000 }).catch(() => {});
    check("join page: titled 'Join <org>'", (await page.getByRole("heading", { name: /Join P5uiGamma/ }).count()) === 1);
    check("join page: names who invited you", (await page.getByText(/Ann Admin \(Admin\) invited you/).count()) === 1);
    check("join page: says you join with your existing password", (await page.getByText(/existing password/).count()) === 1);
    check("join page: NO password field", (await page.getByPlaceholder("Create a password").count()) === 0);
    await page.getByRole("button", { name: /^Join P5uiGamma/ }).click();
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    await page.getByText("Gamma Workspace", { exact: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
    check("join page: joining lands you in the new org", page.url().endsWith("/workspaces") && (await page.getByText("Gamma Workspace", { exact: true }).count()) >= 1, page.url());
    await page.getByTestId("account-badge").click();
    check("join page: ...and the switcher now lists 3 organizations", (await page.getByTestId("org-switcher").getByTestId("org-option").count()) === 3);
    await ctx.close();
  }

  // a brand-new person still gets the password form
  const NEW = "newbie@p5ui-test.example";
  createdEmails.add(NEW);
  const newUser = await prisma.user.create({ data: { organizationId: D.id, name: "Newbie", email: NEW, roles: ["Team Member"], status: "invited", source: "admin-invite" } });
  await prisma.roleAssignment.create({ data: { userId: newUser.id, role: "Team Member", scope: null } });
  await prisma.invite.create({ data: { userId: newUser.id, name: "Newbie", email: NEW, roles: ["Team Member"], scope: null, status: "pending" } });
  const raw2 = randomBytes(12).toString("hex");
  await prisma.user.update({ where: { id: newUser.id }, data: { inviteTokenHash: hashToken(raw2), inviteTokenExpiresAt: new Date(Date.now() + 3600_000) } });
  {
    const { ctx, page } = await fresh();
    await page.goto(`${BASE}/invite/${raw2}`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Create a password").waitFor({ timeout: 8000 }).catch(() => {});
    check("new person: invite page still asks for a password", (await page.getByPlaceholder("Create a password").count()) === 1);
    check("new person: titled 'Complete your registration'", (await page.getByRole("heading", { name: "Complete your registration" }).count()) === 1);
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exitCode = failed ? 1 : 0;
  void mA; void mB;
}

async function cleanup() {
  for (const id of createdOrgIds) {
    await prisma.workspace.deleteMany({ where: { organizationId: id } });
    await prisma.organization.delete({ where: { id } }).catch(() => {});
  }
  for (const email of createdEmails) await prisma.account.deleteMany({ where: { email } });
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browserRef?.close().catch(() => {});
    await cleanup();
    await prisma.$disconnect();
  });

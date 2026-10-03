// Phase 3 browser checks (per-node controls, access editor, directory) against a
// RUNNING dev server (default http://localhost:3100, start it with SMTP_SERVER= so
// no real mail is sent). Needs Playwright, which is not a project dependency:
//   NODE_PATH=<dir>/node_modules npx tsx scripts/test-phase3-ui.ts
// Creates a throwaway org (real Session rows) and deletes ONLY that org, by id.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const TAG = "__phase3ui_test__";
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
  const u = await prisma.user.create({
    data: {
      organizationId: orgId,
      name,
      email: `${name.toLowerCase()}@${TAG}.test`,
      roles: [...new Set(assignments.map((a) => a.role))],
      scope: assignments.find((a) => a.scope)?.scope ?? null,
      status: "active",
      source: "admin-invite",
    },
  });
  await prisma.roleAssignment.createMany({ data: assignments.map((a) => ({ userId: u.id, ...a })) });
  const sid = randomBytes(16).toString("hex");
  await prisma.session.create({ data: { id: sid, userId: u.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { id: u.id, sid };
}

async function main() {
  const org = await prisma.organization.create({ data: { name: TAG } });
  createdOrgIds.push(org.id);
  const mkWs = (n: string, slug: string) =>
    prisma.workspace.create({
      data: {
        organizationId: org.id, name: n, slug,
        initiatives: { create: { name: `${n} init`, slug: "ia", programs: { create: { name: `${n} prog`, slug: "pa", projects: { create: { name: `${n} proj`, slug: "pra" } } } } } },
      },
      include: { initiatives: { include: { programs: { include: { projects: true } } } } },
    });
  const wsA: any = await mkWs("Alpha", "wsa");
  const wsB: any = await mkWs("Beta", "wsb");
  const A = `workspace:${wsA.id}`, B = `workspace:${wsB.id}`;
  const projA = wsA.initiatives[0].programs[0].projects[0];

  const admin = await mkUser(org.id, "UiAdmin", [{ role: "Admin", scope: null }]);
  const progMgr = await mkUser(org.id, "UiProgMgr", [{ role: "Program Manager", scope: A }]);
  const member = await mkUser(org.id, "UiMember", [{ role: "Team Member", scope: A }]);
  const scopedPm = await mkUser(org.id, "UiScopedPM", [{ role: "Portfolio Manager", scope: A }]);
  const multi = await mkUser(org.id, "UiMulti", [{ role: "Program Manager", scope: A }, { role: "Team Member", scope: B }]);
  const three = await mkUser(org.id, "UiThree", [{ role: "Program Manager", scope: A }, { role: "Team Member", scope: B }, { role: "Project Manager", scope: A }]);
  await prisma.task.create({ data: { projectId: projA.id, title: "Own task", responsibleId: member.id } });
  await prisma.task.create({ data: { projectId: projA.id, title: "Other task" } });

  const browser = await chromium.launch();
  const open = async (sid: string, path: string, width = 1280) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    await ctx.addCookies([{ name: "gcode_session", value: sid, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    return page;
  };
  const visible = async (page: any, locator: any) => (await locator.count()) > 0;
  const newBtn = (page: any, what: string) => page.getByRole("button", { name: new RegExp(`New ${what}`) });
  const actions = (page: any) => page.locator('[aria-label="Item actions"]');

  // ================= Block B: per-node controls =================
  {
    const page = await open(admin.sid, "/workspaces");
    check("B admin: sees 'New Workspace'", await visible(page, newBtn(page, "Workspace")));
    check("B admin: workspace cards have an actions menu (2)", (await actions(page).count()) === 2);
    await page.context().close();
  }
  {
    const page = await open(progMgr.sid, "/workspaces");
    check("B Program Manager@A: NO 'New Workspace'", !(await visible(page, newBtn(page, "Workspace"))));
    check("B Program Manager@A: no workspace edit/delete menu", (await actions(page).count()) === 0);
    check("B Program Manager@A: only sees workspace A", (await page.getByText("Beta", { exact: true }).count()) === 0 && (await page.getByText("Alpha", { exact: true }).count()) >= 1);
    await page.goto(`${BASE}/workspaces/wsa`, { waitUntil: "networkidle" });
    check("B Program Manager@A: NO 'New Initiative' (lacks Initiatives cap)", !(await visible(page, newBtn(page, "Initiative"))));
    check("B Program Manager@A: no initiative menu", (await actions(page).count()) === 0);
    await page.goto(`${BASE}/workspaces/wsa/ia`, { waitUntil: "networkidle" });
    check("B Program Manager@A: sees 'New Program' in scope", await visible(page, newBtn(page, "Program")));
    check("B Program Manager@A: program cards have a menu", (await actions(page).count()) === 1);
    await page.goto(`${BASE}/workspaces/wsa/ia/pa`, { waitUntil: "networkidle" });
    check("B Program Manager@A: sees 'New Project'", await visible(page, newBtn(page, "Project")));
    await page.goto(`${BASE}/workspaces/wsa/ia/pa/pra`, { waitUntil: "networkidle" });
    check("B Program Manager@A: sees '+ Add Task'", (await page.getByText("+ Add Task").count()) > 0);
    await page.context().close();
  }
  {
    const page = await open(scopedPm.sid, "/workspaces");
    check("B scoped Portfolio Manager: NO 'New Workspace' (needs org-wide)", !(await visible(page, newBtn(page, "Workspace"))));
    await page.goto(`${BASE}/workspaces/wsa`, { waitUntil: "networkidle" });
    check("B scoped Portfolio Manager: 'New Initiative' inside its workspace", await visible(page, newBtn(page, "Initiative")));
    await page.goto(`${BASE}/workspaces/wsa/ia/pa/pra`, { waitUntil: "networkidle" });
    check("B scoped Portfolio Manager: '+ Add Task' (PM now holds Create/Edit Tasks)", (await page.getByText("+ Add Task").count()) > 0);
    await page.context().close();
  }
  {
    const page = await open(member.sid, "/workspaces/wsa");
    check("B Team Member: NO 'New Initiative'", !(await visible(page, newBtn(page, "Initiative"))));
    await page.goto(`${BASE}/workspaces/wsa/ia`, { waitUntil: "networkidle" });
    check("B Team Member: NO 'New Program'", !(await visible(page, newBtn(page, "Program"))));
    await page.goto(`${BASE}/workspaces/wsa/ia/pa`, { waitUntil: "networkidle" });
    check("B Team Member: NO 'New Project'", !(await visible(page, newBtn(page, "Project"))));
    await page.goto(`${BASE}/workspaces/wsa/ia/pa/pra`, { waitUntil: "networkidle" });
    check("B Team Member: NO '+ Add Task'", (await page.getByText("+ Add Task").count()) === 0);

    // someone else's task: can move status, cannot edit/delete, description read-only
    await page.getByText("Other task", { exact: true }).click();
    const panelSelect = page.locator("select").first();
    check("B Team Member: status select enabled on someone else's task", await panelSelect.isEnabled());
    check("B Team Member: no actions menu on someone else's task", (await page.getByLabel("More actions").count()) === 0);
    check("B Team Member: description read-only on someone else's task", await page.getByPlaceholder("No description yet.").evaluate((el: HTMLTextAreaElement) => el.readOnly));
    await page.getByLabel("Close").click();

    // their own task: Edit + Delete available, delete flow works
    await page.getByText("Own task", { exact: true }).click();
    await page.getByLabel("More actions").click();
    check("B responsible: menu offers Edit", (await page.getByRole("button", { name: "Edit", exact: true }).count()) === 1);
    check("B responsible: menu offers Delete", (await page.getByRole("button", { name: "Delete", exact: true }).count()) === 1);
    check("B responsible: description editable", !(await page.getByPlaceholder("No description yet.").evaluate((el: HTMLTextAreaElement) => el.readOnly)));
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByText('Are you sure you want to delete').waitFor({ timeout: 5000 }).catch(() => {});
    check("B responsible: delete asks for confirmation (modal above the panel)", (await page.getByText("Are you sure you want to delete").count()) === 1);
    await page.getByRole("button", { name: "Delete", exact: true }).last().click();
    const t = page.locator('[data-tone="success"]', { hasText: "Task deleted." });
    await t.waitFor({ timeout: 8000 }).catch(() => {});
    check("B responsible: deleting own task -> success toast", (await t.count()) === 1);
    check("B responsible: task is gone from the board", (await page.getByText("Own task", { exact: true }).count()) === 0);
    check("B responsible: really deleted server-side", (await prisma.task.count({ where: { title: "Own task", projectId: projA.id } })) === 0);
    await page.context().close();
  }

  // ================= Block C: access editor + directory =================
  {
    const page = await open(admin.sid, "/team", 1000); // 1000px: EN_014 width
    check("C directory: has an 'Access' column", (await page.locator("th", { hasText: /^Access$/ }).count()) === 1);
    check("C directory: no separate 'Scope' or 'Role' column", (await page.locator("th", { hasText: /^(Scope|Role)$/ }).count()) === 0);

    const rowFor = (n: string) => page.locator("tr", { hasText: n });
    check("C directory: single-assignment user shows 1 chip", (await rowFor("UiProgMgr").locator('[data-testid="access-cell"] span[title]').count()) === 1);
    check("C directory: multi-scope user shows 2 chips", (await rowFor("UiMulti").locator('[data-testid="access-cell"] span[title]').count()) === 2);
    const cell3 = rowFor("UiThree").locator('[data-testid="access-cell"]');
    check("C directory: 3 assignments -> 2 chips + '+1'", (await cell3.locator("span[title]").count()) === 2 && (await cell3.getByRole("button", { name: "+1" }).count()) === 1);
    await cell3.getByRole("button", { name: "+1" }).click();
    check("C directory: '+1' expands to all 3 chips", (await cell3.locator("span[title]").count()) === 3);
    const chip = await rowFor("UiMulti").locator('[data-testid="access-cell"] span[title]').first().getAttribute("title");
    check("C directory: chip names role and scope (tooltip)", /Program Manager - /.test(chip || ""), chip || "");

    // EN_011: role filter always lists every built-in role
    const sel = page.locator("select").first();
    await sel.selectOption("Program Manager");
    await page.waitForTimeout(800);
    const opts = await sel.locator("option").allTextContents();
    check("C EN_011: after filtering, all roles are still listed", ["Admin", "Portfolio Manager", "Program Manager", "Project Manager", "Team Member"].every((r) => opts.includes(r)), opts.join(","));
    check("C EN_011: filter matches a user holding that role on ANY assignment (UiMulti shown)", (await rowFor("UiMulti").count()) === 1);
    await sel.selectOption("");
    await page.waitForTimeout(500);

    // EN_014: Actions reachable at 1000px even with chips
    const kebab = rowFor("UiThree").getByText("⋮");
    const box = await kebab.boundingBox();
    check("C EN_014: Actions button is inside the 1000px viewport", !!box && box.x + box.width <= 1000 + 1, JSON.stringify(box));

    // ---- Edit modal
    await rowFor("UiMulti").getByText("⋮").click();
    await page.getByRole("button", { name: /^Edit/ }).first().click();
    const rows = page.locator('[data-testid="assignment-row"]');
    check("C editor: opens with one row per assignment (2)", (await rows.count()) === 2);
    const save = page.getByRole("button", { name: "Save", exact: true });
    check("C EN_004: Save disabled until something changes", await save.isDisabled());
    check("C editor: notice that saving signs the person out", (await page.getByText("signs this person out").count()) === 1);

    await page.getByLabel("Role for access row 2").selectOption("Project Manager");
    check("C EN_004: Save enabled after a change", await save.isEnabled());
    await page.getByLabel("Role for access row 2").selectOption("Team Member");
    check("C EN_004: Save disabled again after reverting", await save.isDisabled());

    await page.getByRole("button", { name: "+ Add access" }).click();
    check("C editor: '+ Add access' adds a row", (await rows.count()) === 3);
    await page.getByLabel("Scope for access row 3").selectOption(B); // Team Member on B == row 2 (duplicate)
    check("C editor: duplicate role+scope shows an error", (await page.getByTestId("assignments-error").count()) === 1);
    check("C editor: duplicate disables Save", await save.isDisabled());
    await page.getByLabel("Role for access row 3").selectOption("Admin");
    check("C editor: picking Admin locks that row's scope to Whole Org", (await rows.nth(2).getByTestId("scope-locked").count()) === 1);
    check("C editor: other rows keep a scope picker", (await rows.nth(0).getByTestId("scope-locked").count()) === 0);
    check("C editor: valid again -> Save enabled", await save.isEnabled());
    await page.getByLabel("Remove access row 3").click();
    check("C editor: remove drops the row", (await rows.count()) === 2);
    await page.getByLabel("Remove access row 2").click();
    check("C editor: last remaining row can't be removed", await page.getByLabel("Remove access row 1").isDisabled());

    // save a real change: Program Manager@A + Project Manager@A
    await page.getByRole("button", { name: "+ Add access" }).click();
    await page.getByLabel("Role for access row 2").selectOption("Project Manager");
    await page.getByLabel("Scope for access row 2").selectOption(A);
    await save.click();
    const ok = page.locator('[data-tone="success"]', { hasText: "signed out" });
    await ok.waitFor({ timeout: 8000 }).catch(() => {});
    check("C editor: saving shows the 'signed out' success toast", (await ok.count()) === 1);
    const saved = await prisma.roleAssignment.findMany({ where: { userId: multi.id } });
    check("C editor: saved rows are exactly PM@A + ProjMgr@A", saved.length === 2 && saved.some((r) => r.role === "Program Manager" && r.scope === A) && saved.some((r) => r.role === "Project Manager" && r.scope === A));
    check("C editor: edited user's sessions were revoked", (await prisma.session.count({ where: { userId: multi.id, revokedAt: null } })) === 0);

    // ---- Invite modal with two assignments
    await page.getByRole("button", { name: "+ Invite User" }).click();
    await page.getByPlaceholder("e.g. Alex Kim").fill("UiInvitee");
    await page.getByPlaceholder("alex@company.com").fill("uiinvitee@phase3ui-test.example"); // browser email validation rejects underscores in a domain
    await page.getByLabel("Role for access row 1").selectOption("Program Manager");
    await page.getByLabel("Scope for access row 1").selectOption(A);
    await page.getByRole("button", { name: "+ Add access" }).click();
    await page.getByLabel("Role for access row 2").selectOption("Team Member");
    await page.getByLabel("Scope for access row 2").selectOption(B);
    await page.getByRole("button", { name: "Send Invite" }).click();
    await page.locator('[data-tone]', { hasText: "User created" }).waitFor({ timeout: 10000 }).catch(() => {});
    const inv = await prisma.user.findFirst({ where: { organizationId: org.id, email: "uiinvitee@phase3ui-test.example" }, include: { roleAssignments: true } });
    check("C invite: created with both assignments", inv?.roleAssignments.length === 2 && inv.roleAssignments.some((r) => r.scope === A) && inv.roleAssignments.some((r) => r.scope === B), JSON.stringify({ found: !!inv, rows: inv?.roleAssignments.map((r) => `${r.role}@${r.scope}`) }));
    await page.context().close();
  }

  // ---- EN_004 on the item edit modal
  {
    const page = await open(admin.sid, "/workspaces");
    await actions(page).first().click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const save = page.getByRole("button", { name: "Save", exact: true });
    check("C EN_004: item edit modal opens with Save disabled", await save.isDisabled());
    const name = page.getByPlaceholder("e.g. Workspace name");
    const original = await name.inputValue();
    await name.fill(original + " x");
    check("C EN_004: editing the name enables Save", await save.isEnabled());
    await name.fill(original);
    check("C EN_004: reverting the name disables Save again", await save.isDisabled());
    await page.context().close();
  }

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

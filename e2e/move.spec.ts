import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { ADMIN_SESSION, PM_SESSION, ID, orgId, counts, db, resetAndSeed } from "./support/db";

const BASE = "http://127.0.0.1:3100";

async function signIn(context: BrowserContext, session: string) {
  await context.addCookies([{ name: "gcode_session", value: session, url: BASE }]);
}

// Listing page that shows each item as a card (its parent's page).
const PAGE = {
  workspaces: "/workspaces",
  initsOfAlpha: "/workspaces/alpha-ws",
  initsOfBeta: "/workspaces/beta-ws",
  progsOfAlphaInit: "/workspaces/alpha-ws/alpha-init",
  projsOfBetaProg: "/workspaces/beta-ws/beta-init/beta-prog",
  boardAlpha: "/workspaces/alpha-ws/alpha-init/alpha-prog/alpha-proj",
};

async function openMove(page: Page, listing: string, id: string) {
  await page.goto(listing);
  await page.getByTestId(`item-actions-${id}`).click();
  await page.getByTestId(`move-action-${id}`).click();
  await expect(page.getByTestId("move-modal")).toBeVisible();
}

async function pickTarget(page: Page, targetId: string) {
  await page.getByTestId(`move-target-${targetId}`).click();
}

test.beforeEach(async ({ context }) => {
  await resetAndSeed();
  await signIn(context, ADMIN_SESSION);
});

test.afterAll(async () => {
  await db().$disconnect();
});

test("plain re-parent (same level): keeps the id, only the parent changes, always confirms first", async ({ page }) => {
  const before = await counts();
  await openMove(page, PAGE.initsOfBeta, ID.inB2);
  await pickTarget(page, ID.wsA);
  await expect(page.getByTestId("move-target-name")).toHaveText("Alpha WS");
  await expect(page.getByTestId("move-overflow")).toHaveCount(0);
  // Nothing written yet.
  expect((await db().initiative.findUnique({ where: { id: ID.inB2 } }))?.workspaceId).toBe(ID.wsB);
  await page.getByTestId("move-confirm").click();
  await expect(page.getByTestId("move-modal")).toHaveCount(0);

  const moved = await db().initiative.findUnique({ where: { id: ID.inB2 } });
  expect(moved?.workspaceId).toBe(ID.wsA);
  expect(await counts()).toEqual(before);
});

test("level shift without overflow: empty initiative moved under an initiative becomes a program", async ({ page }) => {
  await db().roleAssignment.create({ data: { userId: "u-pm", role: "Project Manager", scope: `initiative:${ID.inB2}` } });
  const before = await counts();
  await openMove(page, PAGE.initsOfBeta, ID.inB2);
  await pickTarget(page, ID.inA);
  await expect(page.getByTestId("move-overflow")).toHaveCount(0);
  await page.getByTestId("move-confirm").click();
  await expect(page.getByTestId("move-modal")).toHaveCount(0);

  expect(await db().initiative.findUnique({ where: { id: ID.inB2 } })).toBeNull();
  const program = await db().program.findFirst({ where: { name: "Beta Init 2" } });
  expect(program?.initiativeId).toBe(ID.inA);
  const after = await counts();
  expect(after).toEqual({ ...before, initiatives: before.initiatives - 1, programs: before.programs + 1 });
  // Access scoped to the converted item follows it to its new kind:id.
  const ra = await db().roleAssignment.findFirst({ where: { userId: "u-pm", scope: { startsWith: "program:" } } });
  expect(ra?.scope).toBe(`program:${program!.id}`);
});

test("overflow: confirm stays disabled until every branch loses the right number of levels, then data is kept", async ({ page }) => {
  await db().roleAssignment.create({ data: { userId: "u-pm", role: "Project Manager", scope: `program:${ID.pgB}` } });
  const before = await counts();

  // Beta WS (L1) under Alpha WS (L1) -> becomes L2, everything inside shifts down 1.
  await openMove(page, PAGE.workspaces, ID.wsB);
  await pickTarget(page, ID.wsA);
  await expect(page.getByTestId("move-overflow")).toBeVisible();
  await expect(page.getByTestId("move-confirm")).toBeDisabled();

  // Removing only the empty branch's level fixes nothing for the task branch.
  await page.getByTestId(`move-del-${ID.inB2}`).check();
  await expect(page.getByTestId("move-confirm")).toBeDisabled();
  await page.getByTestId(`move-del-${ID.inB2}`).uncheck();

  // Remove the Program level on the task branch (the user's own example).
  await page.getByTestId(`move-del-${ID.pgB}`).check();
  await expect(page.getByTestId("move-delete-summary")).toContainText("Beta Prog");
  await expect(page.getByTestId("move-confirm")).toBeEnabled();
  await page.getByTestId("move-confirm").click();
  await expect(page.getByTestId("move-modal")).toHaveCount(0);

  const p = db();
  // Beta WS is now an initiative under Alpha WS; its initiative became a program; the project moved up under it.
  const betaWsAsInit = await p.initiative.findFirst({ where: { name: "Beta WS" } });
  expect(betaWsAsInit?.workspaceId).toBe(ID.wsA);
  const betaInitAsProg = await p.program.findFirst({ where: { name: "Beta Init" } });
  expect(betaInitAsProg?.initiativeId).toBe(betaWsAsInit!.id);
  const betaProj = await p.project.findUnique({ where: { id: ID.pjB } });
  expect(betaProj?.programId).toBe(betaInitAsProg!.id);
  // The empty "Beta Init 2" branch just shifted down a level.
  expect(await p.program.findFirst({ where: { name: "Beta Init 2" } })).not.toBeNull();
  // Tasks are untouched.
  expect((await p.task.findUnique({ where: { id: ID.t3 } }))?.projectId).toBe(ID.pjB);
  const after = await counts();
  expect(after.tasks).toBe(before.tasks);
  expect(after.projects).toBe(before.projects);
  expect(after.workspaces).toBe(before.workspaces - 1);
  // Only the chosen level was removed, and assignments scoped to it were dropped.
  expect(await p.program.findUnique({ where: { id: ID.pgB } })).toBeNull();
  expect(await p.roleAssignment.count({ where: { scope: `program:${ID.pgB}` } })).toBe(0);
});

test("moving a whole initiative into a project needs all three levels removed; tasks survive", async ({ page }) => {
  const before = await counts();
  await openMove(page, PAGE.initsOfAlpha, ID.inA);
  await pickTarget(page, ID.pjB);
  await expect(page.getByTestId("move-overflow")).toBeVisible();
  for (const id of [ID.inA, ID.pgA]) await page.getByTestId(`move-del-${id}`).check();
  await expect(page.getByTestId("move-confirm")).toBeDisabled(); // 2 of 3 levels only
  await page.getByTestId(`move-del-${ID.pjA}`).check();
  await expect(page.getByTestId("move-confirm")).toBeEnabled();
  await page.getByTestId("move-confirm").click();
  await expect(page.getByTestId("move-modal")).toHaveCount(0);

  const p = db();
  expect((await p.task.findUnique({ where: { id: ID.t1 } }))?.projectId).toBe(ID.pjB);
  expect((await p.task.findUnique({ where: { id: ID.t2 } }))?.projectId).toBe(ID.pjB);
  expect(await p.task.count()).toBe(before.tasks);
  const after = await counts();
  expect(after).toEqual({ ...before, initiatives: before.initiatives - 1, programs: before.programs - 1, projects: before.projects - 1 });
});

test("task move: only a project is a valid parent, then the task changes project", async ({ page }) => {
  await page.goto(PAGE.boardAlpha);
  await page.getByText("Task One").first().click();
  await page.getByLabel("More actions").click();
  await page.getByTestId("task-move-action").click();
  await expect(page.getByTestId("move-modal")).toBeVisible();

  await pickTarget(page, ID.pgB); // a program - not valid for a task
  await expect(page.getByTestId("move-errors")).toBeVisible();
  await expect(page.getByTestId("move-confirm")).toBeDisabled();
  await page.getByRole("button", { name: "Back" }).click();

  await pickTarget(page, ID.pjB);
  await expect(page.getByTestId("move-errors")).toHaveCount(0);
  await page.getByTestId("move-confirm").click();
  await expect(page.getByTestId("move-modal")).toHaveCount(0);
  expect((await db().task.findUnique({ where: { id: ID.t1 } }))?.projectId).toBe(ID.pjB);
});

test("cancelling at the confirm step changes nothing", async ({ page }) => {
  const before = await counts();
  await openMove(page, PAGE.workspaces, ID.wsB);
  await pickTarget(page, ID.wsA);
  await page.getByTestId(`move-del-${ID.pgB}`).check();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("move-modal")).toHaveCount(0);
  expect(await counts()).toEqual(before);
  expect(await db().program.findUnique({ where: { id: ID.pgB } })).not.toBeNull();
});

test("an item can't be moved into itself or its own children (picker + API)", async ({ page, context }) => {
  await openMove(page, PAGE.workspaces, ID.wsA);
  await expect(page.getByTestId(`move-target-${ID.inA}`)).toBeDisabled();
  await expect(page.getByTestId(`move-target-${ID.wsA}`)).toBeDisabled();

  const res = await context.request.post(`${BASE}/api/move`, {
    data: { sourceId: ID.wsA, sourceLevel: "workspace", targetId: ID.inA, targetLevel: "initiative", deleteIds: [] },
  });
  expect(res.status()).toBe(400);
  expect(await db().workspace.findUnique({ where: { id: ID.wsA } })).not.toBeNull();
});

test("server refuses invalid moves: same parent, extra deletions, deleting tasks", async ({ context }) => {
  const post = (data: object) => context.request.post(`${BASE}/api/move`, { data });
  const before = await counts();

  expect((await post({ sourceId: ID.inB2, sourceLevel: "initiative", targetId: ID.wsB, targetLevel: "workspace", deleteIds: [] })).status()).toBe(400);
  // No overflow, so removing a level must be refused (would be pure data loss).
  expect((await post({ sourceId: ID.inB2, sourceLevel: "initiative", targetId: ID.wsA, targetLevel: "workspace", deleteIds: [ID.inB2] })).status()).toBe(400);
  // Tasks can't be removed.
  expect((await post({ sourceId: ID.pjB, sourceLevel: "project", targetId: ID.pgA, targetLevel: "program", deleteIds: [ID.t3] })).status()).toBe(400);
  // Target must exist.
  expect((await post({ sourceId: ID.inB2, sourceLevel: "initiative", targetId: "nope", targetLevel: "workspace", deleteIds: [] })).status()).toBe(404);

  expect(await counts()).toEqual(before);
});

test("another organization's items are unreachable (404) and untouched", async ({ context }) => {
  const before = await counts();
  const res = await context.request.post(`${BASE}/api/move`, {
    data: { sourceId: ID.inB2, sourceLevel: "initiative", targetId: ID.wsOther, targetLevel: "workspace", deleteIds: [] },
  });
  expect(res.status()).toBe(404);
  const res2 = await context.request.post(`${BASE}/api/move`, {
    data: { sourceId: ID.wsOther, sourceLevel: "workspace", targetId: ID.wsA, targetLevel: "workspace", deleteIds: [] },
  });
  expect(res2.status()).toBe(404);
  expect(await counts()).toEqual(before);
  expect(await db().initiative.findUnique({ where: { id: ID.inB2 } })).toMatchObject({ workspaceId: ID.wsB });
  expect((await db().workspace.findUnique({ where: { id: ID.wsOther } }))?.organizationId).not.toBe(orgId());
});

test.describe("non-admin", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await signIn(context, PM_SESSION);
  });

  test("never sees Move to... and the API rejects them", async ({ page, context }) => {
    await page.goto(PAGE.boardAlpha);
    await page.getByText("Task One").first().click();
    await page.getByLabel("More actions").click();
    await expect(page.getByTestId("task-move-action")).toHaveCount(0);

    const before = await counts();
    expect((await context.request.get(`${BASE}/api/move`)).status()).toBe(403);
    const res = await context.request.post(`${BASE}/api/move`, {
      data: { sourceId: ID.t1, sourceLevel: "task", targetId: ID.pjB, targetLevel: "project", deleteIds: [] },
    });
    expect(res.status()).toBe(403);
    expect(await counts()).toEqual(before);
  });
});

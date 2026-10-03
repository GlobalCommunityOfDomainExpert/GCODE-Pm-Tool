// Credential-encryption browser checks (EN_009 option 2): what the REAL pages put on the
// wire, as the Network tab would show it. Against a RUNNING dev server (default
// http://localhost:3100, start it with SMTP_SERVER=). Needs Playwright (not a project dep):
//   NODE_PATH=<dir>/node_modules npx tsx scripts/test-encryption-ui.ts
// Creates throwaway orgs/users and deletes ONLY those, by id / exact email.
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

type Seen = { url: string; method: string; body: string | null };
const watch = (page: any) => {
  const seen: Seen[] = [];
  page.on("request", (r: any) => seen.push({ url: r.url(), method: r.method(), body: r.postData() }));
  return seen;
};
const to = (seen: Seen[], path: string, method = "POST") => seen.filter((s) => s.url.includes(path) && s.method === method);
// "Anything the Network tab could show": every URL and body of every request this page made.
const leaks = (seen: Seen[], secrets: string[]) => seen.filter((s) => secrets.some((x) => s.url.includes(x) || (s.body || "").includes(x)));

async function main() {
  const pw = "n3tw0rk-tab-secret!";
  const email = "ui@encui-test.example";
  createdEmails.add(email);
  const org = await prisma.organization.create({ data: { name: "EncUiOrg" } });
  createdOrgIds.push(org.id);
  await prisma.workspace.create({ data: { organizationId: org.id, name: "Enc Workspace", slug: "enc-ws" } });
  const u = await prisma.user.create({
    data: { organizationId: org.id, name: "Enc Ui", email, roles: ["Admin"], scope: null, passwordHash: await bcrypt.hash(pw, 4), status: "active", source: "admin-invite" },
  });
  await prisma.roleAssignment.create({ data: { userId: u.id, role: "Admin", scope: null } });

  const browser = await chromium.launch();
  browserRef = browser;
  const open = async (init?: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    if (init) await ctx.addInitScript(init);
    return { ctx, page: await ctx.newPage() };
  };
  const signIn = async (page: any, password = pw) => {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("you@company.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();
  };

  // ================= login: the Network tab =================
  {
    const { ctx, page } = await open();
    const seen = watch(page);
    await signIn(page);
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    const login = to(seen, "/api/auth/login");
    check("login: exactly one POST to /api/auth/login", login.length === 1, String(login.length));
    check("login: the Request/Payload tab holds ONLY ciphertext (an 'enc' envelope)", login[0]?.body?.startsWith('{"enc":{') === true, login[0]?.body?.slice(0, 80));
    check("login: NO password anywhere in any request this page made (url or body)", leaks(seen, [pw]).length === 0, JSON.stringify(leaks(seen, [pw]).map((s) => s.url)));
    check("login: NO email in the login request body either", !(login[0]?.body || "").includes("encui-test"));
    check("login: the page fetched the public key first", to(seen, "/api/auth/public-key", "GET").length >= 1);
    await page.getByText("Enc Workspace", { exact: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
    check("login: and it still works end to end", page.url().endsWith("/workspaces") && (await page.getByText("Enc Workspace", { exact: true }).count()) >= 1, page.url());
    // a wrong password through the UI still shows the normal error, not a crypto error
    await ctx.close();
  }
  {
    const { ctx, page } = await open();
    const seen = watch(page);
    await signIn(page, "definitely-wrong-1");
    await page.getByText(/No (organization )?account found/).waitFor({ timeout: 8000 }).catch(() => {});
    check("login: a wrong password shows the normal 'no account' error (not a crypto error)", (await page.getByText(/No (organization )?account found/).count()) === 1);
    check("login: ...and the wrong password never hit the wire in clear either", leaks(seen, ["definitely-wrong-1"]).length === 0);
    await ctx.close();
  }

  // ================= robustness =================
  for (const [label, shift] of [["a clock 10 minutes FAST", 10 * 60_000], ["a clock 1 hour SLOW", -60 * 60_000]] as const) {
    const { ctx, page } = await open(`(() => { const n = Date.now.bind(Date); Date.now = () => n() + (${shift}); })();`);
    await signIn(page);
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    check(`robustness: login works with ${label} (server time is used)`, page.url().endsWith("/workspaces"), page.url());
    await ctx.close();
  }
  {
    // The server's key "changed" between the page fetching it and the login: the first key response is
    // doctored to carry an unknown kid, so the server answers key-expired and the client must retry once.
    const { ctx, page } = await open();
    const seen = watch(page);
    let calls = 0;
    await page.route("**/api/auth/public-key", async (route: any) => {
      calls++;
      if (calls > 1) return route.continue();
      const res = await route.fetch();
      const j = await res.json();
      await route.fulfill({ response: res, json: { ...j, kid: "deadbeefdeadbeef" } });
    });
    await signIn(page);
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    check("robustness: a rotated/stale server key is refetched and the login RETRIES once", page.url().endsWith("/workspaces") && calls === 2, `${page.url()} calls=${calls}`);
    check("robustness: the retry used a second, different ciphertext (two login POSTs)", to(seen, "/api/auth/login").length === 2);
    await ctx.close();
  }
  {
    // Key endpoint unavailable (e.g. not configured): the page falls back to a plain request during the
    // transition. (With AUTH_REQUIRE_ENCRYPTED=true the server rejects that - proven in the API suite.)
    const { ctx, page } = await open();
    const seen = watch(page);
    await page.route("**/api/auth/public-key", (route: any) => route.fulfill({ status: 503, json: { error: "Encryption isn't configured on the server." } }));
    await signIn(page);
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    check("fallback: key endpoint down -> plain login still works during the transition", page.url().endsWith("/workspaces") && !(to(seen, "/api/auth/login")[0]?.body || "").includes('"enc"'), page.url());
    await ctx.close();
  }

  // ================= the other pages =================
  {
    const { ctx, page } = await open();
    const seen = watch(page);
    const regPw = "regist3r-secret-pw";
    await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
    await page.getByLabel("Organization Name").fill("EncUiRegOrg");
    await page.getByLabel("Your Full Name").fill("Reg Person");
    await page.getByLabel("Work Email").fill("reg@encui-test.example");
    await page.getByLabel("Password").fill(regPw);
    createdEmails.add("reg@encui-test.example");
    await page.getByRole("button", { name: "Create Organization" }).click();
    await page.waitForResponse((r: any) => r.url().includes("/api/auth/register-org") && r.request().method() === "POST", { timeout: 15000 }).catch(() => {});
    const reg = to(seen, "/api/auth/register-org");
    check("register: the body is ciphertext only", reg.length === 1 && reg[0].body!.startsWith('{"enc":{'));
    check("register: password, org name, name and email are NOT on the wire", leaks(seen, [regPw, "EncUiRegOrg", "Reg Person", "reg@encui-test"]).length === 0, JSON.stringify(leaks(seen, [regPw, "EncUiRegOrg"]).map((s) => s.url)));
    check("register: the server decrypted it (a pending registration exists)", !!(await prisma.pendingOrgRegistration.findUnique({ where: { email: "reg@encui-test.example" } })));
    await ctx.close();
  }
  {
    const { ctx, page } = await open();
    const seen = watch(page);
    const code = "ENCUI-" + randomBytes(3).toString("hex").toUpperCase();
    await prisma.inviteCode.create({ data: { organizationId: org.id, code, roles: ["Team Member"], scope: null } });
    await page.goto(`${BASE}/join`, { waitUntil: "networkidle" });
    await page.getByLabel("Invite Code").fill(code);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Full Name").waitFor({ timeout: 10000 }).catch(() => {});
    check("join: the invite code is NOT on the wire in clear (lookup)", leaks(seen, [code]).length === 0 && to(seen, "/api/auth/lookup-code")[0]?.body?.startsWith('{"enc":{') === true);
    await page.getByLabel("Full Name").fill("Guest Person");
    await page.getByRole("button", { name: /Join/ }).click();
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    check("join: join-with-code is ciphertext too, and the guest gets in", leaks(seen, [code, "Guest Person"]).length === 0 && page.url().endsWith("/workspaces"), page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await open();
    const seen = watch(page);
    const newEmail = "invitee@encui-test.example";
    createdEmails.add(newEmail);
    const nu = await prisma.user.create({ data: { organizationId: org.id, name: "Invitee", email: newEmail, roles: ["Team Member"], status: "invited", source: "admin-invite" } });
    await prisma.roleAssignment.create({ data: { userId: nu.id, role: "Team Member", scope: null } });
    await prisma.invite.create({ data: { userId: nu.id, name: "Invitee", email: newEmail, roles: ["Team Member"], scope: null, status: "pending" } });
    const raw = randomBytes(12).toString("hex");
    await prisma.user.update({ where: { id: nu.id }, data: { inviteTokenHash: hashToken(raw), inviteTokenExpiresAt: new Date(Date.now() + 600_000) } });
    const invPw = "inv1tee-secret-pw-77";
    await page.goto(`${BASE}/invite/${raw}`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Create a password").fill(invPw);
    await page.getByRole("button", { name: "Complete Registration" }).click();
    await page.waitForURL(/\/workspaces$/, { timeout: 15000 }).catch(() => {});
    const complete = to(seen, "/api/auth/complete-invite");
    check("invite: the new password is ciphertext on the wire", complete.length === 1 && complete[0].body!.startsWith('{"enc":{') && leaks(seen, [invPw]).length === 0);
    check("invite: and the account really was created with that password", page.url().endsWith("/workspaces") && (await prisma.account.findUnique({ where: { email: newEmail } })) !== null && (await bcrypt.compare(invPw, (await prisma.account.findUnique({ where: { email: newEmail } }))!.passwordHash)));
    await ctx.close();
  }

  await browser.close();
  browserRef = null;
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exitCode = failed ? 1 : 0;
}

async function cleanup() {
  for (const email of createdEmails) await prisma.pendingOrgRegistration.deleteMany({ where: { email } });
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

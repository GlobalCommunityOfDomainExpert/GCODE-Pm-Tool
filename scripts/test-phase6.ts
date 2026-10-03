// Phase 6 checks (EN_009: credentials protected in transit, D3) against a RUNNING dev
// server (default http://localhost:3100, start it with SMTP_SERVER=).
// Run: npx tsx scripts/test-phase6.ts
// Creates a throwaway org and deletes ONLY that org, by id.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { httpsDecision } from "../src/lib/https";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const TAG = "__phase6_test__";
const prisma = new PrismaClient();
// Cleanup deletes ONLY the orgs this run created, by id - never by a name pattern.
const createdOrgIds: string[] = [];
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
  if (!ok) failed++;
};

async function main() {
  // ---------------- pure decision function
  const base = { nodeEnv: "production", host: "app.example.com", proto: "http", method: "GET", pathname: "/workspaces", search: "?a=1" };
  const d = (o: object) => httpsDecision({ ...base, ...o });
  check("https: production + http GET -> redirect to https, path and query kept", JSON.stringify(d({})) === JSON.stringify({ action: "redirect", location: "https://app.example.com/workspaces?a=1" }));
  check("https: production + http HEAD -> redirect", d({ method: "HEAD" }).action === "redirect");
  check("https: production + http POST -> REJECT (never redirect a body)", d({ method: "POST", pathname: "/api/auth/login" }).action === "reject");
  check("https: production + http PATCH/PUT/DELETE -> reject", ["PATCH", "PUT", "DELETE"].every((m) => d({ method: m }).action === "reject"));
  check("https: production + https -> allow", d({ proto: "https" }).action === "allow");
  check("https: x-forwarded-proto 'https, http' (first hop wins) -> allow", d({ proto: "https, http" }).action === "allow");
  check("https: production + http on localhost -> allow (local next start)", d({ host: "localhost:3000" }).action === "allow" && d({ host: "127.0.0.1:3000" }).action === "allow");
  check("https: non-production + http -> allow (dev)", d({ nodeEnv: "development" }).action === "allow" && d({ nodeEnv: undefined }).action === "allow");
  check("https: host with port keeps the port in the redirect", (d({ host: "app.example.com:8080" }) as { location: string }).location.startsWith("https://app.example.com:8080/"));

  // ---------------- the real middleware, in production mode
  const { middleware } = await import("../src/middleware");
  const prev = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = "production";
  const mw = (url: string, method: string, headers: Record<string, string> = {}) => middleware(new NextRequest(url, { method, headers }));
  const loginPost = mw("http://app.example.com/api/auth/login", "POST", { host: "app.example.com" });
  check("middleware(prod): http POST /api/auth/login -> 400 and no body processed", loginPost.status === 400 && (await loginPost.json()).error === "HTTPS is required.");
  const page = mw("http://app.example.com/login", "GET", { host: "app.example.com" });
  check("middleware(prod): http GET /login -> 308 to https", page.status === 308 && page.headers.get("location") === "https://app.example.com/login");
  const proxied = mw("http://app.example.com/api/auth/login", "POST", { host: "app.example.com", "x-forwarded-proto": "https" });
  check("middleware(prod): behind a TLS-terminating proxy (x-forwarded-proto https) -> passes through", proxied.status === 200 && proxied.headers.get("x-middleware-next") === "1");
  (process.env as Record<string, string>).NODE_ENV = prev as string;
  const devPost = mw("http://app.example.com/api/auth/login", "POST", { host: "app.example.com" });
  check("middleware(dev): http is untouched", devPost.headers.get("x-middleware-next") === "1");

  // ---------------- live headers
  const login = await fetch(`${BASE}/login`);
  const h = (res: Response, k: string) => res.headers.get(k) || "";
  check("headers: HSTS on pages", /max-age=63072000/.test(h(login, "strict-transport-security")) && /includeSubDomains/.test(h(login, "strict-transport-security")));
  check("headers: nosniff", h(login, "x-content-type-options") === "nosniff");
  check("headers: X-Frame-Options DENY (login can't be framed)", h(login, "x-frame-options") === "DENY");
  check("headers: Referrer-Policy", h(login, "referrer-policy") === "strict-origin-when-cross-origin");
  check("headers: Permissions-Policy", h(login, "permissions-policy").includes("camera=()"));

  // ---------------- no secrets in responses
  const org = await prisma.organization.create({ data: { name: TAG } });
  createdOrgIds.push(org.id);
  const password = "Sup3rSecret!" + randomBytes(3).toString("hex");
  const hash = await bcrypt.hash(password, 10);
  const email = `p6admin@${TAG}.test`;
  const admin = await prisma.user.create({
    data: { organizationId: org.id, name: "P6Admin", email, passwordHash: hash, roles: ["Admin"], scope: null, status: "active", source: "admin-invite" },
  });
  await prisma.roleAssignment.create({ data: { userId: admin.id, role: "Admin", scope: null } });
  await prisma.user.create({
    data: { organizationId: org.id, name: "P6Invited", email: `p6inv@${TAG}.test`, roles: ["Team Member"], status: "invited", source: "admin-invite", inviteTokenHash: "tokenhash-" + randomBytes(8).toString("hex"), inviteTokenExpiresAt: new Date(Date.now() + 3600_000) },
  });
  const ws = await prisma.workspace.create({ data: { organizationId: org.id, name: "p6ws", slug: "p6ws", accountableId: admin.id } });

  const lr = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const loginBody = await lr.text();
  check("login: succeeds with the right password", lr.status === 200, `${lr.status} ${loginBody}`);
  check("login: response is Cache-Control: no-store", h(lr, "cache-control").includes("no-store"));
  const cookie = (lr.headers.get("set-cookie") || "").split(";")[0];
  check("login: session cookie is HttpOnly", /httponly/i.test(lr.headers.get("set-cookie") || ""));
  const bad = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "wrong" }) });
  check("login: wrong password response is no-store too", h(bad, "cache-control").includes("no-store") && bad.status >= 400);

  const secrets = [hash, "$2a$", "$2b$", "passwordHash", "inviteTokenHash", "tokenhash-", password];
  const endpoints: [string, string, unknown?][] = [
    ["GET", "/api/team/users"], ["GET", "/api/team/invite-codes"], ["GET", "/api/team/custom-roles"], ["GET", "/api/team/scope-options"],
    ["GET", "/api/team/export"], ["GET", "/api/team/assignable-users"], ["GET", "/api/workspaces"],
    ["POST", "/api/team/invite", { name: "P6New", email: "p6new@phase6-test.example", roles: ["Team Member"] }],
    ["GET", `/api/team/assignable-users?kind=workspace&id=${ws.id}`],
  ];
  const results: Record<string, string> = { login: loginBody };
  for (const [method, path, body] of endpoints) {
    const res = await fetch(BASE + path, { method, headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    results[`${method} ${path}`] = await res.text();
  }
  results["page /workspaces (server-rendered)"] = await (await fetch(`${BASE}/workspaces`, { headers: { cookie } })).text();
  results["page /team (server-rendered)"] = await (await fetch(`${BASE}/team`, { headers: { cookie } })).text();
  for (const [name, text] of Object.entries(results)) {
    const leaked = secrets.filter((s) => text.includes(s));
    check(`no secrets in: ${name}`, leaked.length === 0, `leaked: ${leaked.join(",")}`);
  }

  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exitCode = failed ? 1 : 0;
}

async function cleanup() {
  for (const id of createdOrgIds) {
    await prisma.workspace.deleteMany({ where: { organizationId: id } });
    await prisma.organization.delete({ where: { id } });
  }
  // Logging in lazily creates an Account for the email - remove that one (exact email) too.
  await prisma.account.deleteMany({ where: { email: `p6admin@${TAG}.test` } });
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

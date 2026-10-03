// Credential-encryption API checks (EN_009 option 2) against a RUNNING dev server
// (default http://localhost:3100, start it with SMTP_SERVER= so no real mail is sent).
// Uses the SAME browser code (src/lib/client/envelope.ts) the login page uses.
// Run: npx tsx scripts/test-encryption-api.ts
// Creates throwaway orgs/users/accounts and deletes ONLY what it created, by id / exact email.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { buildEnvelope } from "../src/lib/client/envelope";
import { hashToken } from "../src/lib/auth/tokens";
import { getKeyPair, readAuthBody } from "../src/lib/auth/payloadCrypto";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const prisma = new PrismaClient();
const createdOrgIds: string[] = [];
const createdEmails = new Set<string>();
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
  if (!ok) failed++;
};

async function serverKey() {
  const res = await fetch(`${BASE}/api/auth/public-key`);
  const j = await res.json();
  return { res, kid: j.kid as string, publicKey: j.publicKey as string, offset: (j.serverTime as number) - Date.now(), raw: j };
}
async function envelope(path: string, body: unknown, o: { offsetDelta?: number; kid?: string } = {}) {
  const k = await serverKey();
  const env = await buildEnvelope({ publicKeyB64: k.publicKey, kid: o.kid ?? k.kid, path, body, clockOffsetMs: k.offset + (o.offsetDelta ?? 0) });
  return env;
}
const post = (path: string, payload: unknown) =>
  fetch(BASE + path, { method: "POST", redirect: "manual", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
const b64flip = (b64: string, at = 5) => {
  const buf = Buffer.from(b64, "base64");
  buf[at % buf.length] ^= 0xff;
  return buf.toString("base64");
};

async function main() {
  const pw = "correct-horse-battery-9";
  const email = "enc@encapi-test.example";
  createdEmails.add(email);
  const org = await prisma.organization.create({ data: { name: "EncApiOrg" } });
  createdOrgIds.push(org.id);
  const u = await prisma.user.create({
    data: { organizationId: org.id, name: "Enc User", email, roles: ["Admin"], scope: null, passwordHash: await bcrypt.hash(pw, 4), status: "active", source: "admin-invite" },
  });
  await prisma.roleAssignment.create({ data: { userId: u.id, role: "Admin", scope: null } });

  // ================= public key endpoint =================
  const k1 = await serverKey();
  check("key: GET /api/auth/public-key -> 200 with kid, publicKey, serverTime", k1.res.status === 200 && !!k1.kid && !!k1.publicKey && typeof k1.raw.serverTime === "number");
  check("key: response is Cache-Control: no-store", (k1.res.headers.get("cache-control") || "").includes("no-store"));
  check("key: it is a PUBLIC key (SPKI), no private material", !JSON.stringify(k1.raw).includes("PRIVATE") && Object.keys(k1.raw).sort().join() === "alg,kid,publicKey,serverTime");
  check("key: kid is stable between calls", (await serverKey()).kid === k1.kid);
  check("key: server clock is close to ours (offset < 5s)", Math.abs(k1.offset) < 5000, String(k1.offset));

  // ================= the happy path =================
  const loginBody = { email, password: pw };
  const env1 = await envelope("/api/auth/login", loginBody);
  const wire = JSON.stringify({ enc: env1 });
  check("wire: the request body contains NO plaintext password", !wire.includes(pw) && !wire.includes("password"));
  check("wire: ...and no email either", !wire.includes("encapi-test") && !wire.includes("@"));
  check("wire: it is just opaque base64 fields", Object.keys(env1).sort().join() === "data,iv,key,kid,v");
  let r = await post("/api/auth/login", { enc: env1 });
  const body = await r.json();
  check("encrypted login -> 200 and a session cookie", r.status === 200 && (r.headers.get("set-cookie") || "").includes("gcode_session="), `${r.status} ${JSON.stringify(body)}`);
  check("encrypted login: same response shape as a plain login", body.id === u.id && body.memberships === 1);

  // ================= replay =================
  r = await post("/api/auth/login", { enc: env1 });
  const replay = await r.json();
  check("replay: the identical request again -> 400 replay", r.status === 400 && replay.code === "replay", JSON.stringify(replay));
  const envRace = await envelope("/api/auth/login", loginBody);
  const results = await Promise.all([post("/api/auth/login", { enc: envRace }), post("/api/auth/login", { enc: envRace }), post("/api/auth/login", { enc: envRace })]);
  const statuses = results.map((x) => x.status).sort();
  check("replay: 3 SIMULTANEOUS copies -> exactly one succeeds (atomic nonce)", statuses.filter((s) => s === 200).length === 1 && statuses.filter((s) => s === 400).length === 2, statuses.join());
  const e2 = await envelope("/api/auth/login", loginBody), e3 = await envelope("/api/auth/login", loginBody);
  check("encryption is randomized: same payload twice -> different ciphertext, key, iv", e2.data !== e3.data && e2.key !== e3.key && e2.iv !== e3.iv);

  // ================= other protections =================
  r = await post("/api/auth/lookup-code", { enc: await envelope("/api/auth/login", loginBody) });
  check("route binding: a login ciphertext sent to ANOTHER endpoint -> 400 wrong-route", r.status === 400 && (await r.json()).code === "wrong-route");
  r = await post("/api/auth/login", { enc: await envelope("/api/auth/login", loginBody, { offsetDelta: -120_000 }) });
  check("freshness: a request stamped 2 min in the past -> 400 stale", r.status === 400 && (await r.json()).code === "stale");
  r = await post("/api/auth/login", { enc: await envelope("/api/auth/login", loginBody, { offsetDelta: 120_000 }) });
  check("freshness: a request stamped 2 min in the future -> 400 stale", r.status === 400 && (await r.json()).code === "stale");
  r = await post("/api/auth/login", { enc: await envelope("/api/auth/login", loginBody, { offsetDelta: -30_000 }) });
  check("freshness: 30s of clock drift is tolerated -> 200", r.status === 200, String(r.status));
  r = await post("/api/auth/login", { enc: await envelope("/api/auth/login", loginBody, { kid: "0000000000000000" }) });
  check("key rotation: an unknown kid -> 400 key-expired (client refetches)", r.status === 400 && (await r.json()).code === "key-expired");

  const good = await envelope("/api/auth/login", loginBody);
  const tamper = async (name: string, mutate: (e: typeof good) => typeof good) => {
    const res = await post("/api/auth/login", { enc: mutate({ ...good, data: good.data, key: good.key, iv: good.iv }) });
    check(name, res.status === 400 && (await res.json()).code === "bad-envelope");
  };
  await tamper("tamper: a flipped byte in the ciphertext (GCM auth) -> 400", (e) => ({ ...e, data: b64flip(e.data, 8) }));
  await tamper("tamper: a flipped byte in the wrapped key -> 400", (e) => ({ ...e, key: b64flip(e.key, 40) }));
  await tamper("tamper: a changed IV -> 400", (e) => ({ ...e, iv: b64flip(e.iv, 2) }));
  await tamper("tamper: truncated ciphertext -> 400", (e) => ({ ...e, data: Buffer.from(e.data, "base64").subarray(0, 10).toString("base64") }));
  await tamper("tamper: wrong envelope version -> 400", (e) => ({ ...e, v: 2 as unknown as 1 }));
  r = await post("/api/auth/login", { enc: { v: 1, kid: k1.kid } });
  check("tamper: envelope with missing fields -> 400", r.status === 400);
  r = await post("/api/auth/login", { enc: "not-an-object" });
  check("tamper: enc that isn't an object -> 400", r.status === 400);
  const burned = await post("/api/auth/login", { enc: good }); // the untouched original is still good (tampering never burned its nonce)
  check("a rejected tampered request does not burn the real nonce", burned.status === 200, String(burned.status));

  // ================= credentials still behave =================
  r = await post("/api/auth/login", { enc: await envelope("/api/auth/login", { email, password: "wrong-password" }) });
  check("encrypted login with a WRONG password -> 401 (not a 400)", r.status === 401);
  r = await post("/api/auth/login", { email, password: pw });
  check("transition: a plain (unencrypted) login still works", r.status === 200, String(r.status));

  // ================= the other routes accept encrypted bodies =================
  const longName = "N".repeat(60), longPw = "p".repeat(200) + "-Aa1";
  const regEmail = "register@encapi-test.example"; createdEmails.add(regEmail);
  r = await post("/api/auth/register-org", { enc: await envelope("/api/auth/register-org", { orgName: longName, name: longName, email: regEmail, password: longPw }) });
  const pend = await prisma.pendingOrgRegistration.findUnique({ where: { email: regEmail } });
  check("register-org: a large encrypted body (hybrid, > 190 bytes) is decrypted and processed", !!pend && (r.status === 200 || r.status === 502), `${r.status}`);
  check("register-org: the password was hashed from the DECRYPTED value", !!pend && (await bcrypt.compare(longPw, pend.passwordHash)));
  if (pend) {
    await prisma.pendingOrgRegistration.update({ where: { email: regEmail }, data: { otpHash: hashToken("246810"), otpExpiresAt: new Date(Date.now() + 600_000), attempts: 0 } });
    r = await post("/api/auth/register-org/verify-otp", { enc: await envelope("/api/auth/register-org/verify-otp", { email: regEmail, otp: "246810" }) });
    check("verify-otp: encrypted code -> 201", r.status === 201, String(r.status));
    const ro = await prisma.organization.findFirst({ where: { name: longName } });
    if (ro) createdOrgIds.push(ro.id);
  }

  const code = await prisma.inviteCode.create({ data: { organizationId: org.id, code: "ENCAPI-" + randomBytes(3).toString("hex").toUpperCase(), roles: ["Team Member"], scope: null } });
  r = await post("/api/auth/lookup-code", { enc: await envelope("/api/auth/lookup-code", { code: code.code }) });
  check("lookup-code: encrypted code -> resolves", r.status === 200 && (await r.json()).type === "temp");
  r = await post("/api/auth/join-with-code", { enc: await envelope("/api/auth/join-with-code", { name: "Guest", code: code.code }) });
  check("join-with-code: encrypted -> joins", r.status === 200, String(r.status));

  const rawTok = randomBytes(12).toString("hex");
  await prisma.user.update({ where: { id: u.id }, data: { inviteTokenHash: hashToken(rawTok), inviteTokenExpiresAt: new Date(Date.now() + 600_000) } });
  r = await post("/api/auth/complete-invite", { enc: await envelope("/api/auth/complete-invite", { token: rawTok, password: "brand-new-password-5" }) });
  check("complete-invite: encrypted new password -> 200", r.status === 200, String(r.status));
  const acc = await prisma.account.findUnique({ where: { email } });
  check("complete-invite: the Account has the DECRYPTED password", !!acc && (await bcrypt.compare("brand-new-password-5", acc.passwordHash)));

  // ================= REQUIRE flag (in-process, same module the routes use) =================
  const kp = getKeyPair();
  const mkReq = async (payload: unknown, path = "/api/auth/login") =>
    new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const prevFlag = process.env.AUTH_REQUIRE_ENCRYPTED;
  process.env.AUTH_REQUIRE_ENCRYPTED = "true";
  let res = await readAuthBody(await mkReq({ email, password: pw }));
  check("REQUIRE=true: a plain body is rejected (encrypted-required)", !res.ok && res.response.status === 400 && (await res.response.json()).code === "encrypted-required");
  res = await readAuthBody(new NextRequest("http://localhost/api/auth/login", { method: "POST", body: "{not json" }));
  check("REQUIRE=true: unparseable JSON is rejected too (no silent downgrade)", !res.ok);
  const encIn = await buildEnvelope({ publicKeyB64: kp.publicSpkiB64, kid: kp.kid, path: "/api/auth/login", body: { email, password: pw } });
  res = await readAuthBody(await mkReq({ enc: encIn }));
  check("REQUIRE=true: an encrypted body is accepted and decrypted", res.ok && res.body.password === pw && res.body.email === email);
  process.env.AUTH_REQUIRE_ENCRYPTED = "false";
  res = await readAuthBody(await mkReq({ email, password: pw }));
  check("REQUIRE=false: a plain body passes straight through", res.ok && res.body.password === pw);
  if (prevFlag === undefined) delete process.env.AUTH_REQUIRE_ENCRYPTED; else process.env.AUTH_REQUIRE_ENCRYPTED = prevFlag;

  // nonce housekeeping: rows exist for used nonces and expire
  const nonces = await prisma.authNonce.count({ where: { expiresAt: { gt: new Date() } } });
  check("nonces are recorded (replay table in use)", nonces > 5, String(nonces));

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
    await cleanup();
    await prisma.$disconnect();
  });

import { NextRequest, NextResponse } from "next/server";
import { readAuthBody } from "@/lib/auth/payloadCrypto";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, LAST_ORG_COOKIE } from "@/lib/auth/session";
import { linkOrCreateAccount } from "@/lib/auth/account";

// Sign in with email + password. One person can hold a membership (User row)
// in several organizations under the same email:
//  - If the email's Account verifies, every membership linked to it is a
//    candidate, and any not-yet-linked row whose own password also verifies is
//    linked now (rows created before Accounts existed).
//  - If it doesn't verify but some row's own password does (legacy rows, or a
//    different password on purpose), that row signs in alone. Different
//    passwords are never merged under one Account.
//  - An Account with no memberships is stale debris and is claimed by a
//    verified login rather than blocking it.
// Which active membership opens: the browser's last-used org if it's one of
// them, otherwise the oldest; when there are several and none was remembered
// the client is told to show the org picker (needsSelect).
export async function POST(req: NextRequest) {
  const parsed = await readAuthBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const email = (body?.email || "").trim().toLowerCase();
  const password = body?.password || "";

  if (!email || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const candidates = await prisma.user.findMany({ where: { email }, orderBy: { createdAt: "asc" } });
  if (candidates.length === 0) {
    return NextResponse.json({ error: "not-found" }, { status: 401 });
  }

  const account = await prisma.account.findUnique({ where: { email }, include: { _count: { select: { users: true } } } });
  const accountOk = !!account && (await verifyPassword(password, account.passwordHash));

  // Rows whose own password verifies (skipping ones already known good via the Account).
  const verified: User[] = [];
  for (const c of candidates) {
    if (accountOk && c.accountId === account!.id) continue;
    if (c.passwordHash && (await verifyPassword(password, c.passwordHash))) verified.push(c);
  }

  let memberships: User[] = [];
  if (accountOk) {
    const toLink = verified.filter((v) => v.accountId === null);
    if (toLink.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: toLink.map((v) => v.id) }, accountId: null }, data: { accountId: account!.id } });
    }
    const linkedIds = new Set(toLink.map((v) => v.id));
    memberships = candidates.filter((c) => c.accountId === account!.id || linkedIds.has(c.id));
  } else if (verified.length > 0) {
    if (!account || account._count.users === 0) {
      const unlinked = verified.filter((v) => v.accountId === null);
      await prisma.$transaction(async (tx) => {
        const accountId = await linkOrCreateAccount(tx, email, verified[0].passwordHash!, { matchesExisting: true });
        if (accountId && unlinked.length > 0) {
          await tx.user.updateMany({ where: { id: { in: unlinked.map((v) => v.id) }, accountId: null }, data: { accountId } });
        }
      });
      memberships = verified;
    } else {
      // The Account has members and this is a different password: stay standalone.
      memberships = [verified[0]];
    }
  } else {
    // Nothing verified. Still say why a real invited/suspended person can't
    // get in (that isn't sensitive - no password was needed to see it).
    if (candidates.some((c) => c.status === "suspended")) return NextResponse.json({ error: "suspended" }, { status: 403 });
    if (candidates.some((c) => c.status === "invited")) return NextResponse.json({ error: "pending" }, { status: 403 });
    return NextResponse.json({ error: "not-found" }, { status: 401 });
  }

  const active = memberships.filter((m) => m.status === "active");
  if (active.length === 0) {
    if (memberships.some((m) => m.status === "suspended")) return NextResponse.json({ error: "suspended" }, { status: 403 });
    return NextResponse.json({ error: "pending" }, { status: 403 });
  }

  const remembered = cookies().get(LAST_ORG_COOKIE)?.value;
  const rememberedMatch = active.find((m) => m.organizationId === remembered);
  const user = rememberedMatch ?? active[0];
  const needsSelect = active.length > 1 && !rememberedMatch;

  await createSession(user.id);
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    memberships: active.length,
    needsSelect,
  });
}

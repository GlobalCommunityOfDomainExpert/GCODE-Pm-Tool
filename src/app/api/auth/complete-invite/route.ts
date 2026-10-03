import { NextRequest, NextResponse } from "next/server";
import { readAuthBody } from "@/lib/auth/payloadCrypto";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { linkOrCreateAccount, setAccountPassword } from "@/lib/auth/account";

// Single endpoint behind the magic link, used by flows that all boil down to
// "prove you hold this token":
//  1. JOIN an existing account (an invite into another org for an email that
//     already has an Account with other memberships): no password is asked or
//     changed - an invite link must never be able to reset someone's password.
//  2. First-time direct invite for a new person: set a password (creates or
//     claims their Account).
//  3. Reset (admin-triggered or self-serve forgot-password): set a new
//     password. It belongs to the Account, so it applies to EVERY membership
//     and signs out every session that used the old one.
export async function POST(req: NextRequest) {
  const parsed = await readAuthBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const token = body?.token || "";
  const password = body?.password || "";

  if (!token) {
    return NextResponse.json({ error: "That link was already used or is no longer valid." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { inviteTokenHash: hashToken(token), inviteTokenExpiresAt: { gt: new Date() } },
  });

  if (!user || user.status === "suspended") {
    return NextResponse.json({ error: "That link was already used or is no longer valid." }, { status: 400 });
  }

  const pendingInvite = await prisma.invite.findFirst({ where: { userId: user.id, status: "pending" } });
  const account = user.accountId
    ? await prisma.account.findUnique({ where: { id: user.accountId }, include: { users: { select: { id: true } } } })
    : null;
  const otherMemberships = account ? account.users.filter((u) => u.id !== user.id).length : 0;
  const joinExisting = !!pendingInvite && !!account && otherMemberships > 0;

  if (joinExisting) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        // The legacy column mirrors the Account's password (dual-write).
        data: { passwordHash: account!.passwordHash, status: "active", inviteTokenHash: null, inviteTokenExpiresAt: null },
      }),
      prisma.invite.updateMany({ where: { userId: user.id, status: "pending" }, data: { status: "accepted" } }),
    ]);
  } else {
    if (!password) {
      return NextResponse.json({ error: "Create a password to finish." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      let accountId = user.accountId;
      if (accountId) {
        // Reset on a linked membership: the Account's password changes everywhere.
        await setAccountPassword(tx, accountId, passwordHash);
      } else if (user.email) {
        accountId = await linkOrCreateAccount(tx, user.email, passwordHash);
      }
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          status: "active",
          inviteTokenHash: null,
          inviteTokenExpiresAt: null,
          ...(accountId ? { accountId } : {}),
        },
      });
      await tx.invite.updateMany({ where: { userId: user.id, status: "pending" }, data: { status: "accepted" } });
    });
  }

  await createSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, roles: user.roles });
}

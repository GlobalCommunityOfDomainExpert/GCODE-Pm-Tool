import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mailDisplayName } from "./scopeLabel";

type Tx = Prisma.TransactionClient;

// One login identity (Account: email + password) can hold a membership (User
// row) in several organizations. Rules that keep this safe:
//  - Passwords belong to the Account. The legacy User.passwordHash column is
//    mirrored on every membership that already has one (dual-write), so the
//    pre-Account fallback keeps working until the contract release.
//  - Different passwords are NEVER merged: if an email's Account has members
//    and a person proves a different password, they stay a standalone User.
//  - An Account with ZERO memberships depends on nobody, so a verified login
//    or registration may claim it (e.g. debris left behind by a deleted org).

// Sets the Account's password and mirrors it onto every membership that has
// one, and signs out every membership's sessions - a password change must end
// whatever else is signed in with the old one.
export async function setAccountPassword(tx: Tx, accountId: string, passwordHash: string): Promise<void> {
  await tx.account.update({ where: { id: accountId }, data: { passwordHash } });
  await tx.user.updateMany({ where: { accountId, passwordHash: { not: null } }, data: { passwordHash } });
  await tx.session.updateMany({ where: { user: { accountId }, revokedAt: null }, data: { revokedAt: new Date() } });
}

// Finds or creates the Account for `email` and decides whether a user who just
// set/proved `passwordHash` may join it. Returns the account id to link, or
// null when it must stay standalone (the Account has members and this is a
// different password). `matchesExisting` = caller already verified the
// plaintext against the Account (login); otherwise the hashes must be equal
// (register-org copies the Account's own hash when the password matched).
export async function linkOrCreateAccount(
  tx: Tx,
  email: string,
  passwordHash: string,
  opts: { matchesExisting?: boolean } = {}
): Promise<string | null> {
  const key = email.toLowerCase();
  const account = await tx.account.findUnique({ where: { email: key }, include: { _count: { select: { users: true } } } });
  if (!account) {
    return (await tx.account.create({ data: { email: key, passwordHash } })).id;
  }
  if (account._count.users === 0) {
    // Nobody depends on it: claim it with the verified password.
    await tx.account.update({ where: { id: account.id }, data: { passwordHash } });
    return account.id;
  }
  if (opts.matchesExisting || account.passwordHash === passwordHash) return account.id;
  return null;
}

export type Membership = { userId: string; label: string; status: string; current: boolean };

// Every membership of an account, labelled the same way emails and the invite
// page label it: the org name only for org-wide standing, otherwise just the
// scope - a scoped member never gets the org's name from the switcher either.
export async function membershipsOf(accountId: string, currentUserId: string): Promise<Membership[]> {
  const users = await prisma.user.findMany({
    where: { accountId },
    include: { roleAssignments: true },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(
    users.map(async (u) => ({
      userId: u.id,
      label: await mailDisplayName(u),
      status: u.status,
      current: u.id === currentUserId,
    }))
  );
}

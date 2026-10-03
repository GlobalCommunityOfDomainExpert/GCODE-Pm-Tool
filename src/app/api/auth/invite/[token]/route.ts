import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { mailDisplayName } from "@/lib/auth/scopeLabel";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const user = await prisma.user.findFirst({
    where: {
      inviteTokenHash: hashToken(params.token),
      inviteTokenExpiresAt: { gt: new Date() },
      status: { not: "suspended" },
    },
    select: {
      id: true,
      name: true,
      email: true,
      roles: true,
      scope: true,
      organizationId: true,
      accountId: true,
      roleAssignments: { select: { role: true, scope: true } },
      invite: { select: { status: true, invitedByName: true, invitedByRole: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "That link is invalid or has expired." }, { status: 404 });
  }
  // Org name only for org-wide people (Admin / no scope); everyone else sees their scope node only.
  const displayName = await mailDisplayName(user);
  const inv = user.invite;
  const inviter = inv?.status === "pending" && inv.invitedByName ? { name: inv.invitedByName, role: inv.invitedByRole || "" } : null;

  // Same rule complete-invite applies: a pending invite into an org for an email whose
  // Account already has other memberships is a JOIN - the page asks for no password.
  const otherMemberships = user.accountId ? await prisma.user.count({ where: { accountId: user.accountId, id: { not: user.id } } }) : 0;
  const joinExisting = inv?.status === "pending" && otherMemberships > 0;

  return NextResponse.json({ name: user.name, email: user.email, roles: user.roles, displayName, inviter, joinExisting });
}

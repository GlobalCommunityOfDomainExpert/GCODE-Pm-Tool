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
    select: { name: true, email: true, roles: true, scope: true, organizationId: true, invite: { select: { status: true, invitedByName: true, invitedByRole: true } } },
  });

  if (!user) {
    return NextResponse.json({ error: "That link is invalid or has expired." }, { status: 404 });
  }
  // Org name only for org-wide people (Admin / no scope); everyone else sees their scope node only.
  const displayName = await mailDisplayName(user);
  const inv = user.invite;
  const inviter = inv?.status === "pending" && inv.invitedByName ? { name: inv.invitedByName, role: inv.invitedByRole || "" } : null;
  return NextResponse.json({ name: user.name, email: user.email, roles: user.roles, displayName, inviter });
}

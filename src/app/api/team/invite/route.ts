import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability } from "@/lib/auth/requireCapability";
import { randomToken, hashToken } from "@/lib/auth/tokens";
import { sendMail, magicLinkEmail } from "@/lib/mailer";
import { mailDisplayName } from "@/lib/auth/scopeLabel";
import { normalizeAccess } from "@/lib/auth/roleRules";
import { setRoleAssignments } from "@/lib/auth/assignments";

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

// FR-8: direct invite, magic link only — no typed code anywhere in this flow.
export const POST = withCapability("Manage Team Members", async (req: NextRequest, _ctx, admin) => {
  const body = await req.json().catch(() => null);
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }

  const { assignments, roles, scope } = await normalizeAccess(admin.organizationId, body);

  const dupe = await prisma.user.findFirst({ where: { organizationId: admin.organizationId, email } });
  if (dupe) {
    return NextResponse.json({ error: "Someone with that email is already on the team." }, { status: 409 });
  }

  // The email already has a login (an Account with memberships elsewhere): attach this
  // new membership to it instead of making a second identity. They JOIN on the invite
  // page with no new password. An Account with no memberships is stale debris - not linked.
  const existingAccount = await prisma.account.findUnique({ where: { email }, include: { _count: { select: { users: true } } } });
  const accountId = existingAccount && existingAccount._count.users > 0 ? existingAccount.id : null;

  const rawToken = randomToken();
  const { user } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: admin.organizationId,
        name,
        email,
        roles,
        scope,
        status: "invited",
        source: "admin-invite",
        ...(accountId ? { accountId } : {}),
        inviteTokenHash: hashToken(rawToken),
        inviteTokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    await setRoleAssignments(tx, user.id, assignments);
    await tx.invite.create({
      data: { userId: user.id, name, email, roles, scope, status: "pending", invitedByName: admin.name, invitedByRole: admin.roles.join(", ") },
    });
    return { user };
  });

  const link = `${req.nextUrl.origin}/invite/${rawToken}`;
  const { subject, text, html } = magicLinkEmail({ displayName: await mailDisplayName({ organizationId: admin.organizationId, roles, scope, roleAssignments: assignments }), recipientName: name, link, isReset: false, inviter: { name: admin.name, role: admin.roles.join(", ") } });

  let sent = true;
  try {
    await sendMail({ to: email, subject, text, html });
  } catch (err) {
    console.error("invite send failed:", err);
    sent = false;
  }

  return NextResponse.json(
    { user: { id: user.id, name: user.name, email: user.email, roles: user.roles, status: user.status }, emailSent: sent },
    { status: 201 }
  );
});

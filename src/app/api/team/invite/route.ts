import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability } from "@/lib/auth/requireCapability";
import { randomToken, hashToken } from "@/lib/auth/tokens";
import { sendMail, magicLinkEmail } from "@/lib/mailer";
import { getTheOrganization } from "@/lib/auth/org";

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

// FR-8: direct invite, magic link only — no typed code anywhere in this flow.
export const POST = withCapability("Manage Team Members", async (req: NextRequest, _ctx, admin) => {
  const body = await req.json().catch(() => null);
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  const roles: string[] = Array.isArray(body?.roles) && body.roles.length ? body.roles : ["Team Member"];
  const scope: string | null = body?.scope || null;

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }

  const dupe = await prisma.user.findFirst({ where: { organizationId: admin.organizationId, email } });
  if (dupe) {
    return NextResponse.json({ error: "Someone with that email is already on the team." }, { status: 409 });
  }

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
        inviteTokenHash: hashToken(rawToken),
        inviteTokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    await tx.invite.create({ data: { userId: user.id, name, email, roles, scope, status: "pending" } });
    return { user };
  });

  const org = await getTheOrganization();
  const link = `${req.nextUrl.origin}/invite/${rawToken}`;
  const { subject, text, html } = magicLinkEmail({ orgName: org?.name || "your organization", recipientName: name, link, isReset: false });

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

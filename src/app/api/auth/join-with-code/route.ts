import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  const code = (body?.code || "").trim().toUpperCase();

  if (!name || !code) {
    return NextResponse.json({ error: "Enter your name to join." }, { status: 400 });
  }

  const user = await prisma.$transaction(async (tx) => {
    const invite = await tx.inviteCode.findFirst({ where: { code, revoked: false } });
    if (!invite || (invite.maxUses != null && invite.usesCount >= invite.maxUses)) {
      return null;
    }

    const user = await tx.user.create({
      data: {
        organizationId: invite.organizationId,
        name,
        email: email || null,
        roles: invite.roles,
        scope: invite.scope,
        status: "active",
        source: "invite-code",
        inviteCodeId: invite.id,
      },
    });

    await tx.inviteCode.update({ where: { id: invite.id }, data: { usesCount: { increment: 1 } } });
    await tx.inviteCodeRedemption.create({ data: { inviteCodeId: invite.id, userId: user.id } });

    return user;
  });

  if (!user) {
    return NextResponse.json({ error: "That code is invalid, revoked, or fully used. Ask your admin for a new one." }, { status: 400 });
  }

  await createSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, roles: user.roles });
}

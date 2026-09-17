import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

// Single endpoint behind the magic link, used by three flows that all boil
// down to "prove you hold this token, set a password": first-time direct
// invite (status was invited), an admin-triggered resend/reset (FR-13,
// status was flipped back to invited), and self-serve forgot-password
// (status stayed active the whole time - see forgot-password/route.ts).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = body?.token || "";
  const password = body?.password || "";

  if (!token || !password) {
    return NextResponse.json({ error: "Create a password to finish." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { inviteTokenHash: hashToken(token), inviteTokenExpiresAt: { gt: new Date() } },
  });

  if (!user || user.status === "suspended") {
    return NextResponse.json({ error: "That link was already used or is no longer valid." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, status: "active", inviteTokenHash: null, inviteTokenExpiresAt: null },
    }),
    prisma.invite.updateMany({ where: { userId: user.id, status: "pending" }, data: { status: "accepted" } }),
  ]);

  await createSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, roles: user.roles });
}

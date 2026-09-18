import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const user = await prisma.user.findFirst({
    where: {
      inviteTokenHash: hashToken(params.token),
      inviteTokenExpiresAt: { gt: new Date() },
      status: { not: "suspended" },
    },
    select: { name: true, email: true, roles: true },
  });

  if (!user) {
    return NextResponse.json({ error: "That link is invalid or has expired." }, { status: 404 });
  }
  return NextResponse.json(user);
}

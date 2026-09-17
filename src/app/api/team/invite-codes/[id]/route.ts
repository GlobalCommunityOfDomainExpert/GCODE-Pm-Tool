import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, ApiError } from "@/lib/auth/requireCapability";

export const PATCH = withCapability("Manage Team Members", async (req: NextRequest, { params }: { params: { id: string } }, user) => {
  const body = await req.json().catch(() => null);
  if (body?.action !== "revoke") throw new ApiError(400, "Unknown action.");

  const code = await prisma.inviteCode.findFirst({ where: { id: params.id, organizationId: user.organizationId } });
  if (!code) throw new ApiError(404, "Invite code not found.");

  const updated = await prisma.inviteCode.update({ where: { id: code.id }, data: { revoked: true } });
  return NextResponse.json(updated);
});

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, ApiError } from "@/lib/auth/requireCapability";
import { generateInviteCode } from "@/lib/auth/tokens";

export const GET = withCapability("Manage Team Members", async (_req, _ctx, user) => {
  const codes = await prisma.inviteCode.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(codes);
});

// FR-9: temp/guest access only. A Client role requires a non-empty scope -
// an org-wide client view defeats the point of scoping a client at all.
export const POST = withCapability("Manage Team Members", async (req: NextRequest, _ctx, user) => {
  const body = await req.json().catch(() => null);
  const roles: string[] = Array.isArray(body?.roles) && body.roles.length ? body.roles : ["Team Member"];
  const scope: string | null = body?.scope || null;
  const note: string | null = body?.note || null;
  const maxUses: number | null = body?.maxUses ? Number(body.maxUses) : null;

  if (roles.includes("Client") && !scope) {
    throw new ApiError(400, 'Pick a Scope for a Client code — "Whole Org" would give an outside client view of everything.');
  }

  const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
  let code = generateInviteCode(org?.name || "GCODE");
  // Vanishingly unlikely, but the unique constraint means a collision needs a retry, not a 500.
  for (let attempt = 0; attempt < 5; attempt++) {
    const exists = await prisma.inviteCode.findUnique({ where: { code } });
    if (!exists) break;
    code = generateInviteCode(org?.name || "GCODE");
  }

  const invite = await prisma.inviteCode.create({
    data: { organizationId: user.organizationId, code, roles, scope, note, maxUses },
  });
  return NextResponse.json(invite, { status: 201 });
});

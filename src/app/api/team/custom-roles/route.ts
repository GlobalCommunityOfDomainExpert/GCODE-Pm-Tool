import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, ApiError } from "@/lib/auth/requireCapability";
import { ALL_CAPABILITIES } from "@/lib/auth/capabilities";

export const GET = withCapability("Manage Team Members", async (_req, _ctx, user) => {
  const roles = await prisma.customRole.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(roles);
});

// Enforced identically to built-in roles from the moment this returns
// (src/lib/auth/capabilities.ts reads CustomRole the same way it reads
// RoleCapability) - not a preview-only record.
export const POST = withCapability("Manage Team Members", async (req: NextRequest, _ctx, user) => {
  const body = await req.json().catch(() => null);
  const name = (body?.name || "").trim();
  const validCapabilities: readonly string[] = ALL_CAPABILITIES;
  const capabilities: string[] = Array.isArray(body?.capabilities)
    ? body.capabilities.filter((c: string) => validCapabilities.includes(c))
    : [];

  if (!name) throw new ApiError(400, "Role name is required.");

  const role = await prisma.customRole.create({ data: { organizationId: user.organizationId, name, capabilities } });
  return NextResponse.json(role, { status: 201 });
});

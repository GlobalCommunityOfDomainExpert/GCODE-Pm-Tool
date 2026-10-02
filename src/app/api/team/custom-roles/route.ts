import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability } from "@/lib/auth/requireCapability";

// Reads the session cookie, so it can never be prerendered - and as a GET-only
// handler (the POST is gone) Next would otherwise try.
export const dynamic = "force-dynamic";

// Read-only since EN_012: custom roles can no longer be created (the POST was
// removed), but anyone already holding one keeps resolving its capabilities
// (src/lib/auth/capabilities.ts), so existing rows stay readable.
export const GET = withCapability("Manage Team Members", async (_req, _ctx, user) => {
  const roles = await prisma.customRole.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(roles);
});

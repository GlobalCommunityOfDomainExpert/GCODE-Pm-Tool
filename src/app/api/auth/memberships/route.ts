import { NextResponse } from "next/server";
import { withSession } from "@/lib/auth/requireCapability";
import { membershipsOf } from "@/lib/auth/account";
import { mailDisplayName } from "@/lib/auth/scopeLabel";
import { prisma } from "@/lib/prisma";

// Reads the session cookie, so it can never be prerendered (a GET-only handler would otherwise be tried).
export const dynamic = "force-dynamic";

// The signed-in person's organizations (for the switcher and /select-org).
// A standalone user (no Account) has exactly one: where they are now.
export const GET = withSession(async (_req, _ctx, user) => {
  if (user.accountId) {
    return NextResponse.json(await membershipsOf(user.accountId, user.id));
  }
  const row = await prisma.user.findUnique({ where: { id: user.id }, include: { roleAssignments: true } });
  return NextResponse.json([{ userId: user.id, label: row ? await mailDisplayName(row) : "", status: user.status, current: true }]);
});

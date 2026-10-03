import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession, ApiError } from "@/lib/auth/requireCapability";
import { createSession, destroySession } from "@/lib/auth/session";
import { mailDisplayName } from "@/lib/auth/scopeLabel";

// Switch to another membership of the SAME Account. This never reuses the old
// session: it is revoked and a brand-new one is created for the chosen
// membership, so roles and scopes from one organization can't leak into the
// next. Only an active membership of the caller's own Account is reachable -
// anything else is a flat 404 (it doesn't confirm other people's ids exist).
export const POST = withSession(async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) throw new ApiError(400, "Choose an organization.");
  if (!user.accountId) throw new ApiError(404, "Not found.");

  const target = await prisma.user.findFirst({ where: { id: userId, accountId: user.accountId }, include: { roleAssignments: true } });
  if (!target) throw new ApiError(404, "Not found.");
  if (target.status !== "active") throw new ApiError(403, "That organization isn't available to you right now.");

  const label = await mailDisplayName(target);
  if (target.id !== user.id) {
    await destroySession();
    await createSession(target.id);
  }
  return NextResponse.json({ ok: true, label });
});

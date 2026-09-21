import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withCapability, withSession, ApiError } from "@/lib/auth/requireCapability";
import { isNodeWithinScopeSubtree, assertAssigneeAllowed } from "@/lib/auth/scope";
import { assertNodeInOrg } from "@/lib/auth/org";

const ACCOUNTABLE_SELECT = { select: { id: true, name: true, email: true } } as const;

export const GET = withSession(async (req, _ctx, user) => {
  const initiativeId = req.nextUrl.searchParams.get("initiativeId");
  if (!initiativeId) return NextResponse.json({ error: "initiativeId is required" }, { status: 400 });
  await assertNodeInOrg("initiative", initiativeId, user.organizationId);

  const programs = await prisma.program.findMany({
    where: { initiativeId },
    include: { accountable: ACCOUNTABLE_SELECT },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(programs);
});

export const POST = withCapability("Create/Edit Projects", async (req, _ctx, user) => {
  const body = await req.json();
  if (!body.initiativeId) return NextResponse.json({ error: "initiativeId is required" }, { status: 400 });
  await assertNodeInOrg("initiative", body.initiativeId, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "initiative", body.initiativeId))) {
    throw new ApiError(403, "That initiative is outside your scope.");
  }
  await assertAssigneeAllowed(user.organizationId, "initiative", body.initiativeId, body.accountableId);

  const program = await prisma.program.create({
    data: { initiativeId: body.initiativeId, name: body.name || "Untitled Program", description: body.description || null, accountableId: body.accountableId || null },
    include: { accountable: ACCOUNTABLE_SELECT },
  });
  revalidateTag(`tree:${user.organizationId}`);
  return NextResponse.json(program, { status: 201 });
});

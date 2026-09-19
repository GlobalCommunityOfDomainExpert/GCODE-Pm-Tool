import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, withSession, ApiError } from "@/lib/auth/requireCapability";
import { isNodeWithinScopeSubtree, assertAssigneeAllowed } from "@/lib/auth/scope";
import { assertNodeInOrg } from "@/lib/auth/org";

const ACCOUNTABLE_SELECT = { select: { id: true, name: true, email: true } } as const;

export const GET = withSession(async (req, _ctx, user) => {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  await assertNodeInOrg("workspace", workspaceId, user.organizationId);

  const initiatives = await prisma.initiative.findMany({
    where: { workspaceId },
    include: { accountable: ACCOUNTABLE_SELECT },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(initiatives);
});

export const POST = withCapability("Create/Edit Workspaces", async (req, _ctx, user) => {
  const body = await req.json();
  if (!body.workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  await assertNodeInOrg("workspace", body.workspaceId, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "workspace", body.workspaceId))) {
    throw new ApiError(403, "That workspace is outside your scope.");
  }
  await assertAssigneeAllowed(user.organizationId, "workspace", body.workspaceId, body.accountableId);

  const initiative = await prisma.initiative.create({
    data: { workspaceId: body.workspaceId, name: body.name || "Untitled Initiative", description: body.description || null, accountableId: body.accountableId || null },
    include: { accountable: ACCOUNTABLE_SELECT },
  });
  return NextResponse.json(initiative, { status: 201 });
});

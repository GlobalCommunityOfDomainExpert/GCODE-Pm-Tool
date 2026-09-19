import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, ApiError } from "@/lib/auth/requireCapability";
import { isNodeWithinScopeSubtree, assertAssigneeAllowed } from "@/lib/auth/scope";
import { assertNodeInOrg } from "@/lib/auth/org";

export const PATCH = withCapability("Create/Edit Workspaces", async (req, { params }: { params: { id: string } }, user) => {
  await assertNodeInOrg("workspace", params.id, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "workspace", params.id))) {
    throw new ApiError(403, "This workspace is outside your scope.");
  }

  const body = await req.json();
  if ("accountableId" in body) {
    await assertAssigneeAllowed(user.organizationId, "workspace", params.id, body.accountableId);
  }

  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = body.name;
  if ("description" in body) data.description = body.description || null;
  if ("accountableId" in body) data.accountableId = body.accountableId || null;

  const workspace = await prisma.workspace.update({
    where: { id: params.id },
    data,
    include: { accountable: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(workspace);
});

export const DELETE = withCapability("Create/Edit Workspaces", async (_req, { params }: { params: { id: string } }, user) => {
  await assertNodeInOrg("workspace", params.id, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "workspace", params.id))) {
    throw new ApiError(403, "This workspace is outside your scope.");
  }
  await prisma.workspace.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
});

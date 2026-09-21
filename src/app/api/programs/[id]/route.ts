import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withCapability, ApiError } from "@/lib/auth/requireCapability";
import { isNodeWithinScopeSubtree, assertAssigneeAllowed } from "@/lib/auth/scope";
import { assertNodeInOrg } from "@/lib/auth/org";

export const PATCH = withCapability("Create/Edit Projects", async (req, { params }: { params: { id: string } }, user) => {
  await assertNodeInOrg("program", params.id, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "program", params.id))) {
    throw new ApiError(403, "This program is outside your scope.");
  }

  const body = await req.json();
  if ("accountableId" in body) {
    await assertAssigneeAllowed(user.organizationId, "program", params.id, body.accountableId);
  }

  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = body.name;
  if ("description" in body) data.description = body.description || null;
  if ("accountableId" in body) data.accountableId = body.accountableId || null;

  const program = await prisma.program.update({
    where: { id: params.id },
    data,
    include: { accountable: { select: { id: true, name: true, email: true } } },
  });
  revalidateTag(`tree:${user.organizationId}`);
  revalidateTag(`node:program:${params.id}`);
  return NextResponse.json(program);
});

export const DELETE = withCapability("Create/Edit Projects", async (_req, { params }: { params: { id: string } }, user) => {
  await assertNodeInOrg("program", params.id, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "program", params.id))) {
    throw new ApiError(403, "This program is outside your scope.");
  }
  await prisma.program.delete({ where: { id: params.id } });
  revalidateTag(`tree:${user.organizationId}`);
  revalidateTag(`node:program:${params.id}`);
  return new NextResponse(null, { status: 204 });
});

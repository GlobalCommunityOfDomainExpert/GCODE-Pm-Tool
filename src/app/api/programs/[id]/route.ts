import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, ApiError } from "@/lib/auth/requireCapability";
import { isNodeWithinScopeSubtree } from "@/lib/auth/scope";
import { assertNodeInOrg } from "@/lib/auth/org";

export const PATCH = withCapability("Create/Edit Projects", async (req, { params }: { params: { id: string } }, user) => {
  await assertNodeInOrg("program", params.id, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "program", params.id))) {
    throw new ApiError(403, "This program is outside your scope.");
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = body.name;
  if ("description" in body) data.description = body.description || null;
  if ("accountableId" in body) data.accountableId = body.accountableId || null;

  const program = await prisma.program.update({ where: { id: params.id }, data, include: { accountable: true } });
  return NextResponse.json(program);
});

export const DELETE = withCapability("Create/Edit Projects", async (_req, { params }: { params: { id: string } }, user) => {
  await assertNodeInOrg("program", params.id, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "program", params.id))) {
    throw new ApiError(403, "This program is outside your scope.");
  }
  await prisma.program.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
});

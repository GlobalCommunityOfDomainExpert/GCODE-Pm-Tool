import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, withSession, ApiError } from "@/lib/auth/requireCapability";
import { isNodeWithinScopeSubtree } from "@/lib/auth/scope";

export const GET = withSession(async (req) => {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  const initiatives = await prisma.initiative.findMany({
    where: { workspaceId },
    include: { accountable: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(initiatives);
});

export const POST = withCapability("Create/Edit Workspaces", async (req, _ctx, user) => {
  const body = await req.json();
  if (!body.workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  if (!(await isNodeWithinScopeSubtree(user.scope, "workspace", body.workspaceId))) {
    throw new ApiError(403, "That workspace is outside your scope.");
  }

  const initiative = await prisma.initiative.create({
    data: { workspaceId: body.workspaceId, name: body.name || "Untitled Initiative", description: body.description || null, accountableId: body.accountableId || null },
    include: { accountable: true },
  });
  return NextResponse.json(initiative, { status: 201 });
});

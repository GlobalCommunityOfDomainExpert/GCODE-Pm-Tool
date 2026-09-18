import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, withSession, ApiError } from "@/lib/auth/requireCapability";
import { isNodeWithinScopeSubtree } from "@/lib/auth/scope";
import { assertNodeInOrg } from "@/lib/auth/org";

export const GET = withSession(async (req, _ctx, user) => {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  await assertNodeInOrg("project", projectId, user.organizationId);

  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { responsible: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(tasks);
});

export const POST = withCapability("Create/Edit Tasks", async (req, _ctx, user) => {
  const body = await req.json();
  if (!body.projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  await assertNodeInOrg("project", body.projectId, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "project", body.projectId))) {
    throw new ApiError(403, "That project is outside your scope.");
  }

  const task = await prisma.task.create({
    data: {
      projectId: body.projectId,
      title: body.title || "Untitled Task",
      status: body.status || "Not Started",
      priority: body.priority || "Medium",
      responsibleId: body.responsibleId || null,
      description: body.description || null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    },
    include: { responsible: true },
  });
  return NextResponse.json(task, { status: 201 });
});

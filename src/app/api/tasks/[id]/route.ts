import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/auth/requireCapability";
import { getCapabilitiesForRoles } from "@/lib/auth/capabilities";
import { isNodeWithinScopeSubtree } from "@/lib/auth/scope";
import { assertNodeInOrg } from "@/lib/auth/org";

// Two ways in: a manager with "Create/Edit Tasks" can change any field on any
// in-scope task; a Team Member with only "Execute Assigned Tasks" can change
// status alone (the kanban drag-and-drop). NOTE: the spec's "further narrowed
// to tasks where responsible_id = caller" isn't enforced here - Task.responsibleId
// points at Person (v0.1's un-authenticated accountable/responsible directory),
// a separate identity from User (v0.2's real accounts), and reconciling the two
// is a real migration, not a route-level fix. Until that lands, any Team Member
// can move the status of any in-scope task, not just their own assignment.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    const capabilities = await getCapabilitiesForRoles(user.organizationId, user.roles);
    const canEditFully = capabilities.has("Create/Edit Tasks");
    const canExecute = capabilities.has("Execute Assigned Tasks");
    if (!canEditFully && !canExecute) throw new ApiError(403, "You don't have permission to do that.");

    await assertNodeInOrg("task", params.id, user.organizationId);
    if (!(await isNodeWithinScopeSubtree(user.scope, "project", await projectIdForTask(params.id)))) {
      throw new ApiError(403, "This task is outside your scope.");
    }

    const body = await req.json();
    const bodyKeys = Object.keys(body);
    if (!canEditFully) {
      const allowedKeys = new Set(["status"]);
      if (!bodyKeys.every((k) => allowedKeys.has(k))) {
        throw new ApiError(403, "Your role can only change a task's status.");
      }
    }

    const data: Record<string, unknown> = {};
    if ("title" in body) data.title = body.title;
    if ("status" in body) data.status = body.status;
    if ("priority" in body) data.priority = body.priority;
    if ("description" in body) data.description = body.description || null;
    if ("responsibleId" in body) data.responsibleId = body.responsibleId || null;
    if ("startDate" in body) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if ("dueDate" in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    const task = await prisma.task.update({ where: { id: params.id }, data, include: { responsible: true } });
    return NextResponse.json(task);
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    const capabilities = await getCapabilitiesForRoles(user.organizationId, user.roles);
    if (!capabilities.has("Create/Edit Tasks")) throw new ApiError(403, "You don't have permission to do that.");
    await assertNodeInOrg("task", params.id, user.organizationId);
    if (!(await isNodeWithinScopeSubtree(user.scope, "project", await projectIdForTask(params.id)))) {
      throw new ApiError(403, "This task is outside your scope.");
    }

    await prisma.task.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

async function projectIdForTask(taskId: string): Promise<string> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!task) throw new ApiError(404, "Task not found.");
  return task.projectId;
}

import { NextRequest, NextResponse } from "next/server";
import { assertTextLimits } from "@/lib/validation";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/auth/requireCapability";
import { getCapabilitiesForRoles } from "@/lib/auth/capabilities";
import { assertAssigneeAllowed } from "@/lib/auth/scope";
import { canOnNode } from "@/lib/auth/access";
import { assertNodeInOrg } from "@/lib/auth/org";

// Three ways in, checked in this order:
// 1. Person responsible (EN_021): whoever the task is assigned to can edit
//    every field and delete THAT task, whatever their role or scope - and
//    only that task. Creating tasks is not implied (the task already exists).
// 2. A manager with "Create/Edit Tasks" covering the task's project can
//    change any field on any in-scope task.
// 3. A Team Member with only "Execute Assigned Tasks" can change status alone
//    (the kanban drag-and-drop). NOTE: the spec's "narrowed to tasks where
//    responsible_id = caller" still isn't enforced for this path - any Team
//    Member can still move the status of any in-scope task. That's a product
//    decision (D4 covers only the responsible person's *extra* rights).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSession();
    await assertNodeInOrg("task", params.id, user.organizationId);
    const { projectId, responsibleId } = await taskOwnership(params.id);
    const isResponsible = responsibleId === user.id;

    let canEditFully = isResponsible;
    if (!canEditFully) {
      const capabilities = await getCapabilitiesForRoles(user.organizationId, user.roles);
      if (!capabilities.has("Create/Edit Tasks") && !capabilities.has("Execute Assigned Tasks")) {
        throw new ApiError(403, "You don't have permission to do that.");
      }
      // Per-node: an assignment must hold the capability AND cover this project.
      canEditFully = await canOnNode(user, "Create/Edit Tasks", "project", projectId);
      const canExecute = canEditFully || (await canOnNode(user, "Execute Assigned Tasks", "project", projectId));
      if (!canExecute) throw new ApiError(403, "This task is outside your scope.");
    }

    const body = await req.json();
    assertTextLimits(body);
    const bodyKeys = Object.keys(body);
    if (!canEditFully) {
      const allowedKeys = new Set(["status"]);
      if (!bodyKeys.every((k) => allowedKeys.has(k))) {
        throw new ApiError(403, "Your role can only change a task's status.");
      }
    }
    if ("responsibleId" in body) {
      await assertAssigneeAllowed(user.organizationId, "project", projectId, body.responsibleId);
    }

    const data: Record<string, unknown> = {};
    if ("title" in body) data.title = body.title;
    if ("status" in body) data.status = body.status;
    if ("priority" in body) data.priority = body.priority;
    if ("description" in body) data.description = body.description || null;
    if ("responsibleId" in body) data.responsibleId = body.responsibleId || null;
    if ("startDate" in body) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if ("dueDate" in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    const task = await prisma.task.update({
      where: { id: params.id },
      data,
      include: { responsible: { select: { id: true, name: true, email: true } } },
    });
    revalidateTag(`tree:${user.organizationId}`);
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
    await assertNodeInOrg("task", params.id, user.organizationId);
    const { projectId, responsibleId } = await taskOwnership(params.id);

    if (responsibleId !== user.id) {
      const capabilities = await getCapabilitiesForRoles(user.organizationId, user.roles);
      if (!capabilities.has("Create/Edit Tasks")) throw new ApiError(403, "You don't have permission to do that.");
      if (!(await canOnNode(user, "Create/Edit Tasks", "project", projectId))) {
        throw new ApiError(403, "This task is outside your scope.");
      }
    }

    await prisma.task.delete({ where: { id: params.id } });
    revalidateTag(`tree:${user.organizationId}`);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

async function taskOwnership(taskId: string): Promise<{ projectId: string; responsibleId: string | null }> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true, responsibleId: true } });
  if (!task) throw new ApiError(404, "Task not found.");
  return task;
}

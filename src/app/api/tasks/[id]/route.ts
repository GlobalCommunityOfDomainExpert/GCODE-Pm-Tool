import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
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
    include: { responsible: true },
  });
  return NextResponse.json(task);
}

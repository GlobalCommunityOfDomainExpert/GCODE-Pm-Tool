import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { responsible: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
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
}

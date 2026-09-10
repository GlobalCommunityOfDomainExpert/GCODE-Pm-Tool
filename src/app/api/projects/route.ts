import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const programId = req.nextUrl.searchParams.get("programId");
  if (!programId) return NextResponse.json({ error: "programId is required" }, { status: 400 });
  const projects = await prisma.project.findMany({
    where: { programId },
    include: { accountable: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.programId) return NextResponse.json({ error: "programId is required" }, { status: 400 });
  const project = await prisma.project.create({
    data: {
      programId: body.programId,
      name: body.name || "Untitled Project",
      description: body.description || null,
      accountableId: body.accountableId || null,
      status: body.status || "On Track",
    },
    include: { accountable: true },
  });
  return NextResponse.json(project, { status: 201 });
}

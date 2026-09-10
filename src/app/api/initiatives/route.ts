import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  const initiatives = await prisma.initiative.findMany({
    where: { workspaceId },
    include: { accountable: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(initiatives);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  const initiative = await prisma.initiative.create({
    data: {
      workspaceId: body.workspaceId,
      name: body.name || "Untitled Initiative",
      description: body.description || null,
      accountableId: body.accountableId || null,
    },
    include: { accountable: true },
  });
  return NextResponse.json(initiative, { status: 201 });
}

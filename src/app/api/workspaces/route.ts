import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const workspaces = await prisma.workspace.findMany({
    include: { accountable: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(workspaces);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const workspace = await prisma.workspace.create({
    data: {
      name: body.name || "Untitled Workspace",
      description: body.description || null,
      accountableId: body.accountableId || null,
    },
    include: { accountable: true },
  });
  return NextResponse.json(workspace, { status: 201 });
}

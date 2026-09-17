import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, withSession } from "@/lib/auth/requireCapability";

export const GET = withSession(async () => {
  const workspaces = await prisma.workspace.findMany({
    include: { accountable: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(workspaces);
});

export const POST = withCapability("Create/Edit Workspaces", async (req) => {
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
});

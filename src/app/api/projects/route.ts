import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, withSession, ApiError } from "@/lib/auth/requireCapability";
import { isNodeWithinScopeSubtree } from "@/lib/auth/scope";

export const GET = withSession(async (req) => {
  const programId = req.nextUrl.searchParams.get("programId");
  if (!programId) return NextResponse.json({ error: "programId is required" }, { status: 400 });
  const projects = await prisma.project.findMany({
    where: { programId },
    include: { accountable: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(projects);
});

export const POST = withCapability("Create/Edit Projects", async (req, _ctx, user) => {
  const body = await req.json();
  if (!body.programId) return NextResponse.json({ error: "programId is required" }, { status: 400 });
  if (!(await isNodeWithinScopeSubtree(user.scope, "program", body.programId))) {
    throw new ApiError(403, "That program is outside your scope.");
  }

  const project = await prisma.project.create({
    data: { programId: body.programId, name: body.name || "Untitled Project", description: body.description || null, accountableId: body.accountableId || null, status: body.status || "On Track" },
    include: { accountable: true },
  });
  return NextResponse.json(project, { status: 201 });
});

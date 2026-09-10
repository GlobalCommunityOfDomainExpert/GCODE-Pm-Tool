import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const initiativeId = req.nextUrl.searchParams.get("initiativeId");
  if (!initiativeId) return NextResponse.json({ error: "initiativeId is required" }, { status: 400 });
  const programs = await prisma.program.findMany({
    where: { initiativeId },
    include: { accountable: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(programs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.initiativeId) return NextResponse.json({ error: "initiativeId is required" }, { status: 400 });
  const program = await prisma.program.create({
    data: {
      initiativeId: body.initiativeId,
      name: body.name || "Untitled Program",
      description: body.description || null,
      accountableId: body.accountableId || null,
    },
    include: { accountable: true },
  });
  return NextResponse.json(program, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if ("name" in body) data.name = body.name;
  if ("description" in body) data.description = body.description || null;
  if ("accountableId" in body) data.accountableId = body.accountableId || null;

  const initiative = await prisma.initiative.update({
    where: { id: params.id },
    data,
    include: { accountable: true },
  });
  return NextResponse.json(initiative);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.initiative.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

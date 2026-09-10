import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.program.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

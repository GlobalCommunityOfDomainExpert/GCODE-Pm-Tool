import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const people = await prisma.person.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
    take: 20,
  });
  return NextResponse.json(people);
}

// Create-on-the-fly for the Accountable/Responsible combobox (FR-8) - no separate
// people-management screen, so this is the only way new people enter the directory.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const person = await prisma.person.create({ data: { name } });
  return NextResponse.json(person, { status: 201 });
}

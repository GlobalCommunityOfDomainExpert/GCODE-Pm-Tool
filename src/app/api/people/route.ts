import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/auth/requireCapability";

export const GET = withSession(async (req, _ctx, user) => {
  const q = req.nextUrl.searchParams.get("q") || "";
  const people = await prisma.person.findMany({
    where: {
      organizationId: user.organizationId,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { name: "asc" },
    take: 20,
  });
  return NextResponse.json(people);
});

// Create-on-the-fly for the Accountable/Responsible combobox (FR-8) - no separate
// people-management screen, so this is the only way new people enter the directory.
// Session-gated only (any authenticated user), same low-stakes convenience v0.1 had.
export const POST = withSession(async (req, _ctx, user) => {
  const body = await req.json();
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const person = await prisma.person.create({ data: { name, organizationId: user.organizationId } });
  return NextResponse.json(person, { status: 201 });
});

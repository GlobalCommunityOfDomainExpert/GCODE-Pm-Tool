import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability } from "@/lib/auth/requireCapability";

export const GET = withCapability("Manage Team Members", async (req, _ctx, user) => {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const role = req.nextUrl.searchParams.get("role")?.trim() || "";

  const users = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
      ...(role ? { roles: { has: role } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      roles: true,
      scope: true,
      status: true,
      source: true,
      inviteCode: { select: { code: true } },
      createdAt: true,
    },
  });

  return NextResponse.json(users);
});

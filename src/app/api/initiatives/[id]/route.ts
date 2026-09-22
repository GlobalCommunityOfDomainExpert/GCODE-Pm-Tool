import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withCapability, ApiError } from "@/lib/auth/requireCapability";
import { isNodeWithinScopeSubtree, assertAssigneeAllowed } from "@/lib/auth/scope";
import { assertNodeInOrg } from "@/lib/auth/org";
import { slugify, uniqueSlug } from "@/lib/slug";

export const PATCH = withCapability("Create/Edit Workspaces", async (req, { params }: { params: { id: string } }, user) => {
  await assertNodeInOrg("initiative", params.id, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "initiative", params.id))) {
    throw new ApiError(403, "This initiative is outside your scope.");
  }

  const body = await req.json();
  if ("accountableId" in body) {
    await assertAssigneeAllowed(user.organizationId, "initiative", params.id, body.accountableId);
  }

  const data: Record<string, unknown> = {};
  if ("name" in body) {
    data.name = body.name;
    const current = await prisma.initiative.findUniqueOrThrow({ where: { id: params.id }, select: { workspaceId: true } });
    data.slug = await uniqueSlug(
      slugify(body.name),
      async (candidate) =>
        (await prisma.initiative.count({ where: { workspaceId: current.workspaceId, slug: candidate, NOT: { id: params.id } } })) > 0
    );
  }
  if ("description" in body) data.description = body.description || null;
  if ("accountableId" in body) data.accountableId = body.accountableId || null;

  const initiative = await prisma.initiative.update({
    where: { id: params.id },
    data,
    include: { accountable: { select: { id: true, name: true, email: true } } },
  });
  revalidateTag(`tree:${user.organizationId}`);
  revalidateTag(`node:initiative:${params.id}`);
  return NextResponse.json(initiative);
});

export const DELETE = withCapability("Create/Edit Workspaces", async (_req, { params }: { params: { id: string } }, user) => {
  await assertNodeInOrg("initiative", params.id, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "initiative", params.id))) {
    throw new ApiError(403, "This initiative is outside your scope.");
  }
  await prisma.initiative.delete({ where: { id: params.id } });
  revalidateTag(`tree:${user.organizationId}`);
  revalidateTag(`node:initiative:${params.id}`);
  return new NextResponse(null, { status: 204 });
});

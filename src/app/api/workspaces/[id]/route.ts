import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withCapability, ApiError } from "@/lib/auth/requireCapability";
import { isNodeWithinScopeSubtree, assertAssigneeAllowed } from "@/lib/auth/scope";
import { assertNodeInOrg } from "@/lib/auth/org";
import { slugify, uniqueSlug } from "@/lib/slug";

// Mirrors the same check in ../route.ts (POST) - keep the two in sync if
// this ever changes.
const LOGO_DATA_URL = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/;
function isValidLogoData(value: unknown): value is string {
  return typeof value === "string" && value.length <= 600_000 && LOGO_DATA_URL.test(value);
}

export const PATCH = withCapability("Create/Edit Workspaces", async (req, { params }: { params: { id: string } }, user) => {
  await assertNodeInOrg("workspace", params.id, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "workspace", params.id))) {
    throw new ApiError(403, "This workspace is outside your scope.");
  }

  const body = await req.json();
  if ("accountableId" in body) {
    await assertAssigneeAllowed(user.organizationId, "workspace", params.id, body.accountableId);
  }
  if ("logoData" in body && body.logoData != null && !isValidLogoData(body.logoData)) {
    return NextResponse.json({ error: "That logo image couldn't be saved - please try a smaller image." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if ("name" in body) {
    data.name = body.name;
    // Slug follows the name - regenerated on every rename (old links to
    // this workspace stop resolving; that's the accepted tradeoff for
    // always-readable URLs, see the slug feature's design discussion).
    data.slug = await uniqueSlug(
      slugify(body.name),
      async (candidate) =>
        (await prisma.workspace.count({ where: { organizationId: user.organizationId, slug: candidate, NOT: { id: params.id } } })) > 0
    );
  }
  if ("description" in body) data.description = body.description || null;
  if ("accountableId" in body) data.accountableId = body.accountableId || null;
  if ("logoData" in body) data.logoData = body.logoData || null;

  const workspace = await prisma.workspace.update({
    where: { id: params.id },
    data,
    include: { accountable: { select: { id: true, name: true, email: true } } },
  });
  revalidateTag(`tree:${user.organizationId}`);
  revalidateTag(`node:workspace:${params.id}`);
  return NextResponse.json(workspace);
});

export const DELETE = withCapability("Create/Edit Workspaces", async (_req, { params }: { params: { id: string } }, user) => {
  await assertNodeInOrg("workspace", params.id, user.organizationId);
  if (!(await isNodeWithinScopeSubtree(user.scope, "workspace", params.id))) {
    throw new ApiError(403, "This workspace is outside your scope.");
  }
  await prisma.workspace.delete({ where: { id: params.id } });
  revalidateTag(`tree:${user.organizationId}`);
  revalidateTag(`node:workspace:${params.id}`);
  return new NextResponse(null, { status: 204 });
});

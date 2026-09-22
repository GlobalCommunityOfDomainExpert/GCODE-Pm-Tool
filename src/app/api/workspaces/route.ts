import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withCapability, withSession } from "@/lib/auth/requireCapability";
import { assertAssigneeAllowed } from "@/lib/auth/scope";

const ACCOUNTABLE_SELECT = { select: { id: true, name: true, email: true } } as const;

// Client-side already caps the raw file at 400KB and only offers an image
// picker, but this is user-controlled request body - never trust it.
// Base64 inflates size ~4/3x, so 600k chars covers the 400KB cap plus the
// data: URL prefix with room to spare.
const LOGO_DATA_URL = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/;
function isValidLogoData(value: unknown): value is string {
  return typeof value === "string" && value.length <= 600_000 && LOGO_DATA_URL.test(value);
}

export const GET = withSession(async (_req, _ctx, user) => {
  const workspaces = await prisma.workspace.findMany({
    where: { organizationId: user.organizationId },
    include: { accountable: ACCOUNTABLE_SELECT },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(workspaces);
});

export const POST = withCapability("Create/Edit Workspaces", async (req, _ctx, user) => {
  const body = await req.json();
  // A brand-new Workspace has no parent to scope an assignee against - only
  // org-wide (unscoped) teammates are eligible, see assertAssigneeAllowed.
  await assertAssigneeAllowed(user.organizationId, null, null, body.accountableId);

  if (body.logoData != null && !isValidLogoData(body.logoData)) {
    return NextResponse.json({ error: "That logo image couldn't be saved - please try a smaller image." }, { status: 400 });
  }

  const workspace = await prisma.workspace.create({
    data: {
      organizationId: user.organizationId,
      name: body.name || "Untitled Workspace",
      description: body.description || null,
      accountableId: body.accountableId || null,
      logoData: body.logoData || null,
    },
    include: { accountable: ACCOUNTABLE_SELECT },
  });
  revalidateTag(`tree:${user.organizationId}`);
  return NextResponse.json(workspace, { status: 201 });
});

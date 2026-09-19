import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, withSession } from "@/lib/auth/requireCapability";
import { assertAssigneeAllowed } from "@/lib/auth/scope";

const ACCOUNTABLE_SELECT = { select: { id: true, name: true, email: true } } as const;

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

  const workspace = await prisma.workspace.create({
    data: {
      organizationId: user.organizationId,
      name: body.name || "Untitled Workspace",
      description: body.description || null,
      accountableId: body.accountableId || null,
    },
    include: { accountable: ACCOUNTABLE_SELECT },
  });
  return NextResponse.json(workspace, { status: 201 });
});

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { withSession, ApiError } from "@/lib/auth/requireCapability";
import { isOrgAdmin } from "@/lib/auth/access";
import { assertNodeInOrg } from "@/lib/auth/org";
import { assertTextLimits } from "@/lib/validation";
import { loadOrgTree, moveItem } from "@/lib/move/execute";
import type { HierarchyLevel } from "@/lib/types";

const LEVELS: HierarchyLevel[] = ["workspace", "initiative", "program", "project", "task"];

// Moving can delete whole levels, so it's Admin-only (org-wide Admin), not a
// per-node capability like ordinary edits.
export const GET = withSession(async (_req, _ctx, user) => {
  if (!isOrgAdmin(user)) throw new ApiError(403, "Only an Admin can move items.");
  return NextResponse.json({ tree: await loadOrgTree(user.organizationId) });
});

export const POST = withSession(async (req, _ctx, user) => {
  if (!isOrgAdmin(user)) throw new ApiError(403, "Only an Admin can move items.");

  const body = await req.json().catch(() => null);
  const sourceId = typeof body?.sourceId === "string" ? body.sourceId : "";
  const targetId = typeof body?.targetId === "string" ? body.targetId : "";
  const sourceLevel = body?.sourceLevel as HierarchyLevel;
  const targetLevel = body?.targetLevel as HierarchyLevel;
  const deleteIds: string[] = Array.isArray(body?.deleteIds) ? body.deleteIds.filter((x: unknown) => typeof x === "string") : [];
  const fillNames: string[] = Array.isArray(body?.fillNames) ? body.fillNames.filter((x: unknown) => typeof x === "string") : [];
  for (const n of fillNames) assertTextLimits({ name: n });
  if (!sourceId || !targetId || !LEVELS.includes(sourceLevel) || !LEVELS.includes(targetLevel)) {
    throw new ApiError(400, "Pick an item and where to move it.");
  }

  // Org tenancy first (404s a cross-org id), then the move itself re-checks both ends.
  await assertNodeInOrg(sourceLevel, sourceId, user.organizationId);
  await assertNodeInOrg(targetLevel, targetId, user.organizationId);

  const result = await moveItem(user.organizationId, { sourceId, targetId, deleteIds, fillNames });

  revalidateTag(`tree:${user.organizationId}`);
  return NextResponse.json(result);
});

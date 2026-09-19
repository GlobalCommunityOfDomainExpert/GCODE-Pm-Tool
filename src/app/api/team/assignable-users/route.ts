import { NextResponse } from "next/server";
import { withSession, ApiError } from "@/lib/auth/requireCapability";
import { assertNodeInOrg } from "@/lib/auth/org";
import { assignableUsersForNode, type ScopeKind } from "@/lib/auth/scope";

const SCOPE_KINDS = new Set<ScopeKind>(["workspace", "initiative", "program", "project"]);

// Backs the Accountable/Responsible picker on Create/Edit for every level
// (L1-L5): who counts as "in scope" is `kind`+`id` - the item's own (level,
// id) when editing, or its parent's (level, id) when creating one underneath
// it (see CreateItemModal's PARENT_KIND map). Omitting both means "no parent
// to scope against" (new root Workspace) - only org-wide (unscoped) users
// come back. Session-gated only (not "Manage Team Members") - anyone who can
// open the create/edit modal needs this, not just admins; it only ever
// returns id/name/email, never role/scope/status like /api/team/users does.
export const GET = withSession(async (req, _ctx, user) => {
  const kindParam = req.nextUrl.searchParams.get("kind");
  const id = req.nextUrl.searchParams.get("id");
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";

  let kind: ScopeKind | null = null;
  if (kindParam) {
    if (!SCOPE_KINDS.has(kindParam as ScopeKind)) {
      throw new ApiError(400, "Invalid kind.");
    }
    if (!id) return NextResponse.json({ error: "id is required with kind" }, { status: 400 });
    kind = kindParam as ScopeKind;
    await assertNodeInOrg(kind, id, user.organizationId);
  }

  const users = await assignableUsersForNode(user.organizationId, kind, kind ? id : null);
  const filtered = q
    ? users.filter((u) => u.name.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q))
    : users;

  return NextResponse.json(filtered.slice(0, 50));
});

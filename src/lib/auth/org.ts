import { prisma } from "@/lib/prisma";
import { ApiError } from "./requireCapability";
import { workspaceIdForAnyNode } from "./scope";
import type { HierarchyLevel } from "@/lib/types";

// The org-tenancy check: a harder boundary than RBAC scope, since it applies
// regardless of role - even an Admin of org A must never read or write org
// B's data. 404s (not 403) so a cross-org id doesn't even confirm it exists.
export async function assertNodeInOrg(level: HierarchyLevel, id: string, organizationId: string): Promise<void> {
  const workspaceId = await workspaceIdForAnyNode(level, id);
  if (!workspaceId) throw new ApiError(404, "Not found.");
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { organizationId: true } });
  if (!ws || ws.organizationId !== organizationId) throw new ApiError(404, "Not found.");
}

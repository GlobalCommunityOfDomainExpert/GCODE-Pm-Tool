import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export * from "./capabilityConstants";

// Union of capabilities across every role the user holds (built-in + custom).
// Built-in roles read RoleCapability (seeded at build time, never edited at
// runtime) and CustomRole (currently create-only - no edit/delete route
// exists yet, see src/app/api/team/custom-roles/route.ts). Nothing in the
// running app can change what an existing (organizationId, roles) combo
// resolves to, so this is safe to cache cross-request with no invalidation
// wiring; the `capabilities:${organizationId}` tag and 5-minute revalidate
// are just a safety net for if an edit/delete route is ever added.
//
// unstable_cache only (no React.cache): this is called from Route Handlers
// too (src/lib/auth/requireCapability.ts), which run outside the React
// Server Component render tree - React.cache throws there since Next
// resolves a plain `react` build (no `cache` export) for route bundles.
export async function getCapabilitiesForRoles(organizationId: string, roles: string[]): Promise<Set<string>> {
  if (roles.length === 0) return new Set();
  const sortedRoles = [...roles].sort();

  const caps = await unstable_cache(
    async () => {
      const [builtIn, custom] = await Promise.all([
        prisma.roleCapability.findMany({ where: { roleName: { in: roles } } }),
        prisma.customRole.findMany({ where: { organizationId, name: { in: roles } } }),
      ]);
      const list: string[] = [];
      for (const row of builtIn) list.push(row.capability);
      for (const role of custom) for (const cap of role.capabilities) list.push(cap);
      return list;
    },
    [`capabilities:${organizationId}:${sortedRoles.join(",")}`],
    { tags: [`capabilities:${organizationId}`], revalidate: 300 }
  )();

  return new Set(caps);
}

import { prisma } from "@/lib/prisma";

export * from "./capabilityConstants";

// Union of capabilities across every role the user holds (built-in + custom).
// Built-in roles read RoleCapability; anything else is looked up in CustomRole
// scoped to the caller's org - same code path, so editing a custom role's
// checkboxes changes what it can do on the very next request.
export async function getCapabilitiesForRoles(organizationId: string, roles: string[]): Promise<Set<string>> {
  if (roles.length === 0) return new Set();

  const [builtIn, custom] = await Promise.all([
    prisma.roleCapability.findMany({ where: { roleName: { in: roles } } }),
    prisma.customRole.findMany({ where: { organizationId, name: { in: roles } } }),
  ]);

  const caps = new Set<string>();
  for (const row of builtIn) caps.add(row.capability);
  for (const role of custom) for (const cap of role.capabilities) caps.add(cap);
  return caps;
}

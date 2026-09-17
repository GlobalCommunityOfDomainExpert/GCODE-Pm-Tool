// Seeds the built-in 5-tier RoleCapability matrix. Additive/idempotent —
// upserts only, never deletes/touches Workspace/Initiative/Program/Project/
// Task/Person data (unlike prisma/seed.ts, which wipes and reseeds those).
import { PrismaClient } from "@prisma/client";
import { ROLE_CAPABILITY_MATRIX } from "../src/lib/auth/capabilities";

const prisma = new PrismaClient();

// Client isn't one of the 5 RBAC tiers (it's a view-only convention, always
// scoped - see docs/roles_and_permissions.md) but still needs read access to
// render anything, so it's seeded here rather than in the typed matrix.
const EXTRA_ROLES: Record<string, string[]> = { Client: ["View Workspaces"] };

async function main() {
  let count = 0;
  for (const [roleName, capabilities] of [...Object.entries(ROLE_CAPABILITY_MATRIX), ...Object.entries(EXTRA_ROLES)]) {
    for (const capability of capabilities) {
      await prisma.roleCapability.upsert({
        where: { roleName_capability: { roleName, capability } },
        update: {},
        create: { roleName, capability },
      });
      count++;
    }
  }
  console.log(`Seeded ${count} role_capabilities rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

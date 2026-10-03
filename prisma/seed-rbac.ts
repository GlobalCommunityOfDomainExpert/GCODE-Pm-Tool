// Seeds the built-in 5-tier RoleCapability matrix. Additive/idempotent —
// upserts only, never deletes/touches Workspace/Initiative/Program/Project/
// Task/Person data (unlike prisma/seed.ts, which wipes and reseeds those).
import { PrismaClient } from "@prisma/client";
// From capabilityConstants directly, not capabilities.ts - that module has a
// top-level React.cache(...) call (RSC-only API) that throws immediately on
// import under tsx/plain Node, which is how this script runs.
import { ALL_CAPABILITIES, ROLE_CAPABILITY_MATRIX } from "../src/lib/auth/capabilityConstants";

const prisma = new PrismaClient();

// Client isn't one of the 5 RBAC tiers: it's a view-only convention, always
// scoped. Visibility comes from scope, not a capability, so it holds none.

async function main() {
  let count = 0;
  for (const [roleName, capabilities] of Object.entries(ROLE_CAPABILITY_MATRIX)) {
    for (const capability of capabilities) {
      await prisma.roleCapability.upsert({
        where: { roleName_capability: { roleName, capability } },
        update: {},
        create: { roleName, capability },
      });
      count++;
    }
  }
  // RoleCapability is seeded config (not user data): drop rows for capabilities
  // that no longer exist in the matrix, so a removed capability can't linger.
  const stale = await prisma.roleCapability.deleteMany({ where: { capability: { notIn: [...ALL_CAPABILITIES] } } });
  console.log(`Seeded ${count} role_capabilities rows, removed ${stale.count} stale.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

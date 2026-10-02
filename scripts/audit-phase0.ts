// READ-ONLY pre-migration audit for the R1 expand migration
// (Enhancement-Plan.pdf section 8.4). Only SELECT/count queries - never writes.
// Run: npx tsx scripts/audit-phase0.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function scopeExists(scope: string): Promise<boolean> {
  const [kind, id] = scope.split(":");
  if (!id) return false;
  const args = { where: { id }, select: { id: true } };
  if (kind === "workspace") return !!(await prisma.workspace.findUnique(args));
  if (kind === "initiative") return !!(await prisma.initiative.findUnique(args));
  if (kind === "program") return !!(await prisma.program.findUnique(args));
  if (kind === "project") return !!(await prisma.project.findUnique(args));
  return false;
}

async function main() {
  const counts = {
    Organization: await prisma.organization.count(),
    User: await prisma.user.count(),
    Workspace: await prisma.workspace.count(),
    Initiative: await prisma.initiative.count(),
    Program: await prisma.program.count(),
    Project: await prisma.project.count(),
    Task: await prisma.task.count(),
    Session: await prisma.session.count(),
    Invite: await prisma.invite.count(),
    InviteCode: await prisma.inviteCode.count(),
    CustomRole: await prisma.customRole.count(),
  };
  console.log("== Row counts");
  console.table(counts);

  const users = await prisma.user.findMany({
    select: { id: true, organizationId: true, name: true, email: true, passwordHash: true, roles: true, scope: true, status: true },
  });

  console.log("\n== Users by status");
  const byStatus: Record<string, number> = {};
  for (const u of users) byStatus[u.status] = (byStatus[u.status] ?? 0) + 1;
  console.table(byStatus);

  const noRoles = users.filter((u) => u.roles.length === 0);
  const dupRoles = users.filter((u) => new Set(u.roles).size !== u.roles.length);
  const noEmail = users.filter((u) => !u.email);
  const noPassword = users.filter((u) => u.email && !u.passwordHash);
  console.log(`\n== Users with NO roles (get no RoleAssignment): ${noRoles.length}`);
  for (const u of noRoles) console.log(`  ${u.id} ${u.name} [${u.status}]`);
  console.log(`== Users with duplicate role entries: ${dupRoles.length}`);
  console.log(`== Email-less (guest) users - no Account: ${noEmail.length}`);
  console.log(`== Users with email but no password yet (invited) - no Account yet: ${noPassword.length}`);

  const customRoleNames = new Set((await prisma.customRole.findMany({ select: { name: true } })).map((c) => c.name));
  const holdingCustom = users.filter((u) => u.roles.some((r) => customRoleNames.has(r)));
  console.log(`== Users holding a custom role: ${holdingCustom.length}`);

  console.log("\n== Same email across multiple orgs");
  const byEmail = new Map<string, typeof users>();
  for (const u of users) {
    if (!u.email) continue;
    const k = u.email.toLowerCase();
    byEmail.set(k, [...(byEmail.get(k) ?? []), u]);
  }
  let multi = 0;
  let conflict = 0;
  for (const [email, rows] of byEmail) {
    if (rows.length < 2) continue;
    multi++;
    const hashes = new Set(rows.map((r) => r.passwordHash).filter(Boolean));
    if (hashes.size > 1) {
      conflict++;
      console.log(`  CONFLICT (different passwords, will NOT be linked): ${email} x${rows.length}`);
    }
  }
  console.log(`  emails in >1 row: ${multi}; with conflicting passwords: ${conflict}`);

  console.log("\n== Scoped Admin / Portfolio Manager (EN_013 / EN_019 data changes)");
  const scopedOrgWide = users.filter((u) => u.scope && (u.roles.includes("Admin") || u.roles.includes("Portfolio Manager")));
  for (const u of scopedOrgWide) console.log(`  ${u.name} <${u.email}> roles=${u.roles.join(",")} scope=${u.scope}`);
  console.log(`  total: ${scopedOrgWide.length}`);

  console.log("\n== Dangling scopes (point at deleted nodes)");
  let dangling = 0;
  for (const u of users) {
    if (u.scope && !(await scopeExists(u.scope))) {
      dangling++;
      console.log(`  user ${u.name} scope=${u.scope}`);
    }
  }
  for (const t of ["invite", "inviteCode"] as const) {
    const rows: { scope: string | null }[] = await (prisma[t] as any).findMany({ select: { scope: true } });
    for (const r of rows) if (r.scope && !(await scopeExists(r.scope))) { dangling++; console.log(`  ${t} scope=${r.scope}`); }
  }
  console.log(`  total: ${dangling}`);

  console.log("\n== Workspaces / users with null organizationId (legacy)");
  console.log(`  workspaces without org: ${await prisma.workspace.count({ where: { organizationId: null } })}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

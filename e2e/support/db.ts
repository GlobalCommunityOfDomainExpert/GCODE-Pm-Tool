import { PrismaClient } from "@prisma/client";

export const TEST_DB_URL = "postgresql://postgres:e2e@127.0.0.1:15432/gcode_e2e";

// Hard guard: these helpers WIPE tables. They only ever run against the
// throwaway Docker Postgres, never whatever .env points at.
function assertTestDb() {
  const url = process.env.DATABASE_URL || "";
  if (url !== TEST_DB_URL) {
    throw new Error(`Refusing to touch ${url ? "a non-test database" : "an unset DATABASE_URL"} - e2e must run against ${TEST_DB_URL}`);
  }
}

let client: PrismaClient | null = null;
export function db(): PrismaClient {
  assertTestDb();
  client ??= new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  return client;
}

// A fresh org id per seed: the app caches each org's tree for minutes
// (unstable_cache, keyed by org), so reusing one id would serve the previous
// test's tree after a reset.
let seq = 0;
let currentOrg = "org-e2e-0";
export const orgId = () => currentOrg;
export const OTHER_ORG = "org-other";
export const ADMIN_SESSION = "sess-admin";
export const PM_SESSION = "sess-pm";

// Fixed ids so specs can address nodes directly.
//   Alpha WS > Alpha Init > Alpha Prog > Alpha Proj > [Task One, Task Two]
//   Beta WS  > Beta Init  > Beta Prog  > Beta Proj  > [Task Three]
//                         > Beta Init 2 (empty)
export const ID = {
  wsA: "ws-a", inA: "in-a", pgA: "pg-a", pjA: "pj-a", t1: "t-1", t2: "t-2",
  wsB: "ws-b", inB: "in-b", pgB: "pg-b", pjB: "pj-b", t3: "t-3",
  inB2: "in-b2",
  wsOther: "ws-other",
} as const;

export async function resetAndSeed() {
  const p = db();
  // Children first; none of this is user data.
  await p.roleAssignment.deleteMany();
  await p.session.deleteMany();
  await p.task.deleteMany();
  await p.project.deleteMany();
  await p.program.deleteMany();
  await p.initiative.deleteMany();
  await p.workspace.deleteMany();
  await p.user.deleteMany();
  await p.organization.deleteMany();

  currentOrg = `org-e2e-${Date.now()}-${++seq}`;
  const ORG = currentOrg;
  await p.organization.createMany({ data: [{ id: ORG, name: "E2E Org" }, { id: OTHER_ORG, name: "Other Org" }] });

  await p.user.create({ data: { id: "u-admin", organizationId: ORG, name: "Ada Admin", email: "admin@e2e.test", roles: ["Admin"], scope: null, status: "active", source: "org-founder" } });
  await p.user.create({ data: { id: "u-pm", organizationId: ORG, name: "Pam Manager", email: "pm@e2e.test", roles: ["Project Manager"], scope: `project:${ID.pjA}`, status: "active", source: "admin-invite" } });
  await p.roleAssignment.createMany({
    data: [
      { userId: "u-admin", role: "Admin", scope: null },
      { userId: "u-pm", role: "Project Manager", scope: `project:${ID.pjA}` },
    ],
  });
  const exp = new Date(Date.now() + 24 * 3600 * 1000);
  await p.session.createMany({
    data: [
      { id: ADMIN_SESSION, userId: "u-admin", expiresAt: exp },
      { id: PM_SESSION, userId: "u-pm", expiresAt: exp },
    ],
  });

  const ws = (id: string, name: string, slug: string, org = ORG) => p.workspace.create({ data: { id, organizationId: org, name, slug, description: `${name} desc`, logoData: null } });
  await ws(ID.wsA, "Alpha WS", "alpha-ws");
  await ws(ID.wsB, "Beta WS", "beta-ws");
  await ws(ID.wsOther, "Other WS", "other-ws", OTHER_ORG);

  await p.initiative.createMany({
    data: [
      { id: ID.inA, workspaceId: ID.wsA, name: "Alpha Init", slug: "alpha-init", accountableId: "u-admin" },
      { id: ID.inB, workspaceId: ID.wsB, name: "Beta Init", slug: "beta-init" },
      { id: ID.inB2, workspaceId: ID.wsB, name: "Beta Init 2", slug: "beta-init-2" },
    ],
  });
  await p.program.createMany({
    data: [
      { id: ID.pgA, initiativeId: ID.inA, name: "Alpha Prog", slug: "alpha-prog" },
      { id: ID.pgB, initiativeId: ID.inB, name: "Beta Prog", slug: "beta-prog" },
    ],
  });
  await p.project.createMany({
    data: [
      { id: ID.pjA, programId: ID.pgA, name: "Alpha Proj", slug: "alpha-proj" },
      { id: ID.pjB, programId: ID.pgB, name: "Beta Proj", slug: "beta-proj" },
    ],
  });
  await p.task.createMany({
    data: [
      { id: ID.t1, projectId: ID.pjA, title: "Task One" },
      { id: ID.t2, projectId: ID.pjA, title: "Task Two", status: "Completed" },
      { id: ID.t3, projectId: ID.pjB, title: "Task Three" },
    ],
  });
}

export async function counts() {
  const p = db();
  return {
    workspaces: await p.workspace.count(),
    initiatives: await p.initiative.count(),
    programs: await p.program.count(),
    projects: await p.project.count(),
    tasks: await p.task.count(),
  };
}

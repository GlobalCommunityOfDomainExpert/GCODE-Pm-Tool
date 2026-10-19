// Fake-data seed for eyeballing the UI. Wipes and refills ONLY the throwaway
// Docker demo database - refuses to run against anything else.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const DEMO_URL = "postgresql://postgres:e2e@127.0.0.1:15432/gcode_demo";
if (process.env.DATABASE_URL !== DEMO_URL) {
  console.error(`Refusing to run: DATABASE_URL must be ${DEMO_URL}`);
  process.exit(1);
}

const prisma = new PrismaClient();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const day = (n: number) => new Date(Date.now() + n * 86400000);

async function main() {
  for (const m of [prisma.roleAssignment, prisma.session, prisma.task, prisma.project, prisma.program, prisma.initiative, prisma.workspace, prisma.user, prisma.account, prisma.organization]) {
    await (m as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }

  const org = await prisma.organization.create({ data: { name: "Acme Industries" } });
  const hash = await bcrypt.hash("Demo@12345", 10);
  const account = await prisma.account.create({ data: { email: "admin@demo.test", passwordHash: hash } });

  const mk = (name: string, email: string, roles: string[], scope: string | null = null, accountId: string | null = null) =>
    prisma.user.create({ data: { organizationId: org.id, name, email, passwordHash: hash, roles, scope, status: "active", source: "admin-invite", accountId } });
  const admin = await mk("Priya Nair", "admin@demo.test", ["Admin"], null, account.id);
  const people = [
    admin,
    await mk("Marcus Lee", "marcus@demo.test", ["Portfolio Manager"]),
    await mk("Asha Singh", "asha@demo.test", ["Program Manager"]),
    await mk("Tom Becker", "tom@demo.test", ["Project Manager"]),
    await mk("Lena Ortiz", "lena@demo.test", ["Team Member"]),
  ];
  await prisma.roleAssignment.createMany({
    data: people.map((u) => ({ userId: u.id, role: u.roles[0], scope: null })),
  });
  const who = (i: number) => people[i % people.length].id;

  const STATUSES = ["Not Started", "In Progress", "Review Pending", "Paused", "Completed", "Yet To Update"];
  const PRIOS = ["High", "Medium", "Low"];
  const CONTAINER = ["On Track", "At Risk", "In Progress", "To Do"];

  const tree: Record<string, Record<string, Record<string, Record<string, string[]>>>> = {
    "Growth": {
      "Acquisition": {
        "Signup Revamp": { "Onboarding flow": ["Design new signup form", "Email verification step", "Phone number verification", "Confirm legal copy for consent", "A/B test headline"], "Referral program": ["Referral link generator", "Reward ledger", "Fraud rules"] },
        "Paid Campaigns": { "Q4 launch": ["Creative brief", "Landing page", "Tracking pixels"] },
      },
      "Retention": {
        "Loyalty": { "Points engine": ["Define tiers", "Points API", "Expiry job", "Admin report"] },
      },
    },
    "Operations": {
      "Supply Chain": {
        "Vendor Portal": { "Vendor onboarding": ["KYC checklist", "Contract upload", "Approval workflow"], "Invoicing": ["Invoice parser", "Three-way match", "Payment run"] },
        "Warehouse Sync": { "Inventory API": ["Schema review", "Sync worker", "Backfill script", "Monitoring"] },
      },
      "Facilities": {
        "Office Move": { "Logistics": ["Book movers", "IT inventory", "Seating plan"] },
      },
    },
    "People & Culture": {
      "Hiring": {
        "Engineering Hiring": { "Pipeline": ["Source candidates", "Screen calls", "Panel schedule", "Offer templates"] },
      },
    },
  };

  let n = 0;
  for (const [wsName, inits] of Object.entries(tree)) {
    const ws = await prisma.workspace.create({ data: { organizationId: org.id, name: wsName, slug: slug(wsName), description: `${wsName} portfolio for Acme.`, status: CONTAINER[n++ % 4], accountableId: who(n) } });
    for (const [inName, progs] of Object.entries(inits)) {
      const init = await prisma.initiative.create({ data: { workspaceId: ws.id, name: inName, slug: slug(inName), description: `${inName} initiative.`, status: CONTAINER[n++ % 4], accountableId: who(n) } });
      for (const [pgName, projs] of Object.entries(progs)) {
        const prog = await prisma.program.create({ data: { initiativeId: init.id, name: pgName, slug: slug(pgName), description: `${pgName} program.`, status: CONTAINER[n++ % 4], accountableId: who(n) } });
        for (const [pjName, tasks] of Object.entries(projs)) {
          const proj = await prisma.project.create({ data: { programId: prog.id, name: pjName, slug: slug(pjName), description: `${pjName} project.`, status: CONTAINER[n++ % 4], accountableId: who(n) } });
          await prisma.task.createMany({
            data: tasks.map((title, i) => ({
              projectId: proj.id,
              title,
              status: STATUSES[(n + i) % STATUSES.length],
              priority: PRIOS[(n + i) % 3],
              responsibleId: who(n + i),
              description: i % 2 ? `Notes for "${title}".` : null,
              startDate: day(-10 + i),
              dueDate: day(3 + i * 4),
            })),
          });
        }
      }
    }
  }
  console.log("Demo data ready. Sign in: admin@demo.test / Demo@12345");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

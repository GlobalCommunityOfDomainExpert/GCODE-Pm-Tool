import { PrismaClient } from "@prisma/client";
import { slugify } from "../src/lib/slug";

const prisma = new PrismaClient();

type TaskRow = {
  title: string;
  description?: string;
  responsible: string;
  priority?: "High" | "Medium" | "Low";
  status: string;
  dueDate?: string; // YYYY-MM-DD
};

type ProjectRow = {
  name: string;
  accountable: string;
  tasks: TaskRow[];
};

type ProgramRow = {
  name: string;
  accountable: string;
  projects: ProjectRow[];
};

type InitiativeRow = {
  name: string;
  accountable: string;
  programs: ProgramRow[];
};

// Parsed from ~/Downloads/Gcode Potfolio Managment - Sheet1-1.pdf
const DATA: InitiativeRow[] = [
  {
    name: "Platform Development",
    accountable: "Arup",
    programs: [
      {
        name: "Infrastructure & UI Updates",
        accountable: "Arup",
        projects: [
          {
            name: "Payment Integrations",
            accountable: "Arup",
            tasks: [
              { title: "Razorpay compliance issue", description: "Zoho Payment Gateway", responsible: "Atharva", priority: "High", status: "In Progress" },
              { title: "ICIC Bank payment Integration ( research )", responsible: "Atharva", priority: "High", status: "Paused" },
            ],
          },
          {
            name: "Event Management Features",
            accountable: "Srini",
            tasks: [{ title: "Add a feature to unlist events", responsible: "Atharva", priority: "Low", status: "In Progress" }],
          },
          {
            name: "DevOps Setup",
            accountable: "Arup",
            tasks: [
              { title: "Setup oracle database & Ords locally", responsible: "Atharva", priority: "High", status: "Review Pending", dueDate: "2026-09-05" },
              { title: "Syncing Cloud to Local", responsible: "Atharva", priority: "High", status: "Review Pending", dueDate: "2026-09-05" },
              { title: "Setting up Mail Pit ( Local SMTP )", responsible: "Atharva", priority: "High", status: "In Progress", dueDate: "2026-09-05" },
              { title: "Setting up Github actions", responsible: "Atharva", priority: "High", status: "In Progress", dueDate: "2026-09-05" },
              { title: "Staging to production", responsible: "Atharva", priority: "High", status: "Not Started", dueDate: "2026-09-05" },
            ],
          },
          {
            name: "Webinar Development",
            accountable: "Srini",
            tasks: [{ title: "Webinar Development", responsible: "Shashwat", priority: "Medium", status: "Not Started" }],
          },
          {
            name: "Quality Assurance",
            accountable: "Arup",
            tasks: [
              { title: "create a list of test to pass (test results)", responsible: "Atharva", priority: "Low", status: "Not Started" },
              { title: "lay the ground for regression testing", responsible: "Atharva", priority: "Low", status: "Yet To Update" },
            ],
          },
          {
            name: "Communication Integrations",
            accountable: "Arup",
            tasks: [{ title: "Whatsapp integration (business verification failure)", responsible: "Shashwat", priority: "Medium", status: "Paused" }],
          },
        ],
      },
      {
        name: "gcode.in V1 Migration",
        accountable: "Arup",
        projects: [
          {
            name: "Data Migration",
            accountable: "Arup",
            tasks: [{ title: "Get all the users to gcode.in", responsible: "Atharva", priority: "Medium", status: "Yet To Update" }],
          },
        ],
      },
      {
        name: "gcode.in V2 Data Migration",
        accountable: "Arun",
        projects: [
          {
            name: "Data Migration",
            accountable: "Arun",
            tasks: [
              { title: "Technical — Define V1 → V2 data migration strategy", responsible: "Shashwat", priority: "Medium", status: "In Progress" },
              { title: "Approval — Get V1 → V2 data migration strategy approved", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" },
              {
                title: "Technical — Execute V1 → V2 data migration",
                description: "Map existing Expert Advisory data to V2 schema; Migrate existing users and expert data; Validate migrated data and resolve migration issues",
                responsible: "Shashwat",
                priority: "Medium",
                status: "Yet To Update",
              },
            ],
          },
        ],
      },
      {
        name: "gcode.in V2 Execution",
        accountable: "Jeevan",
        projects: [
          {
            name: "Advisory Planning",
            accountable: "Jeevan",
            tasks: [
              {
                title: "Design — Create existing Expert Advisory process flow",
                description: "Map current user journey; Map expert journey; Identify system interactions and dependencies",
                responsible: "Shashwat",
                priority: "Medium",
                status: "In Progress",
              },
              {
                title: "Design — Create to-be Expert Advisory process and wireframes",
                description: "Define improved user flow; Define expert flow; Create wireframes; Map onboarding → profile → service → booking → payment → call",
                responsible: "Shashwat",
                priority: "Medium",
                status: "Yet To Update",
              },
              {
                title: "Approval — Get the to-be Expert Advisory process approved",
                description: "Review with stakeholders; Incorporate feedback; Freeze/approve process and scope",
                responsible: "Shashwat",
                priority: "Medium",
                status: "Yet To Update",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Event Management",
    accountable: "Srini",
    programs: [
      {
        name: "G24 Event Execution",
        accountable: "Srini",
        projects: [
          {
            name: "Social Media Content",
            accountable: "Srini",
            tasks: [{ title: "Create template for Onam event for instagram", responsible: "Shashwat", priority: "High", status: "Not Started", dueDate: "2026-09-01" }],
          },
        ],
      },
      {
        name: "Webinar Platform Launch",
        accountable: "Atharva",
        projects: [
          {
            name: "Pilot Testing",
            accountable: "Atharva",
            tasks: [
              { title: "Create a sample event on how the webinar experience will work", responsible: "Atharva", priority: "Medium", status: "Yet To Update", dueDate: "2026-09-25" },
              { title: "Create a small prototype webinar among the friends without pay for 100 students", responsible: "Atharva", priority: "Medium", status: "Yet To Update", dueDate: "2026-09-25" },
              { title: "Create a paid prototype webinar among the friends with pay for 20 students", responsible: "Atharva", priority: "Medium", status: "Yet To Update", dueDate: "2026-09-25" },
            ],
          },
          {
            name: "Strategy & Planning",
            accountable: "Atharva",
            tasks: [
              { title: "Experience inputs to be changed and final model to be approved by srini", responsible: "Atharva", priority: "Medium", status: "Yet To Update", dueDate: "2026-09-25" },
              { title: "Align on the GTM strategy - What topics and who will teach with its digital marketing plan", responsible: "Atharva", priority: "Medium", status: "Yet To Update", dueDate: "2026-09-25" },
            ],
          },
          {
            name: "Launch Execution",
            accountable: "Atharva",
            tasks: [{ title: "Launch the first mega webinar with a targeted revenue of 50000", responsible: "Atharva", priority: "Medium", status: "Yet To Update", dueDate: "2026-09-25" }],
          },
        ],
      },
    ],
  },
  {
    name: "Operations",
    accountable: "Srini",
    programs: [
      {
        name: "Premium lounge",
        accountable: "Srini",
        projects: [
          { name: "Members Kit", accountable: "Srini", tasks: [{ title: "Members Kit", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" }] },
          { name: "Members Project", accountable: "Srini", tasks: [{ title: "Members Project", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" }] },
          { name: "Members Recognition", accountable: "Srini", tasks: [{ title: "Members Recognition", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" }] },
        ],
      },
      {
        name: "Repostory For Recreaction",
        accountable: "Srini",
        projects: [
          { name: "General", accountable: "Srini", tasks: [{ title: "Repostory For Recreaction", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" }] },
        ],
      },
      {
        name: "Tool & Platform payments",
        accountable: "Srini",
        projects: [
          {
            name: "General",
            accountable: "Srini",
            tasks: [
              {
                title: "1. Create a List of Platform subscription 2. Mail every monday to arup sir, regarding what is paid and what is planned",
                responsible: "Shashwat",
                priority: "Medium",
                status: "Yet To Update",
              },
            ],
          },
        ],
      },
      {
        name: "KTPOA GTM",
        accountable: "Srini",
        projects: [
          {
            name: "General",
            accountable: "Srini",
            tasks: [
              { title: "Mailer to tpo's for 100 trial version", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" },
              { title: "Webinar on university 2.0", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" },
            ],
          },
        ],
      },
      {
        name: "Partner Program",
        accountable: "Srini",
        projects: [
          {
            name: "General",
            accountable: "Srini",
            tasks: [
              { title: "Onboarding", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" },
              { title: "Engagement", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" },
              { title: "Revenue Model", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" },
            ],
          },
        ],
      },
      {
        name: "Tech & Dev",
        accountable: "Srini",
        projects: [{ name: "General", accountable: "Srini", tasks: [{ title: "Doumentation & Flows", responsible: "Shashwat", priority: "Medium", status: "Yet To Update" }] }],
      },
    ],
  },
];

async function main() {
  // Wipe first so this is safe to re-run (workspace scope only; leaves nothing else to clash with).
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.program.deleteMany();
  await prisma.initiative.deleteMany();
  await prisma.workspace.deleteMany({ where: { name: "GCODE" } });

  const names = new Set<string>();
  for (const init of DATA) {
    names.add(init.accountable);
    for (const prog of init.programs) {
      names.add(prog.accountable);
      for (const proj of prog.projects) {
        names.add(proj.accountable);
        for (const task of proj.tasks) names.add(task.responsible);
      }
    }
  }

  const people = new Map<string, string>(); // name -> id
  for (const name of names) {
    const existing = await prisma.person.findFirst({ where: { name } });
    const person = existing || (await prisma.person.create({ data: { name } }));
    people.set(name, person.id);
  }

  await prisma.workspace.create({
    data: {
      name: "GCODE",
      slug: slugify("GCODE"),
      description: "Portfolio of Platform Development, Event Management, and Operations work.",
      status: "In Progress",
      accountableId: people.get("Arup"),
      initiatives: {
        create: DATA.map((init) => ({
          name: init.name,
          slug: slugify(init.name),
          status: "In Progress",
          accountableId: people.get(init.accountable),
          programs: {
            create: init.programs.map((prog) => ({
              name: prog.name,
              slug: slugify(prog.name),
              status: "In Progress",
              accountableId: people.get(prog.accountable),
              projects: {
                create: prog.projects.map((proj) => ({
                  name: proj.name,
                  slug: slugify(proj.name),
                  status: "In Progress",
                  accountableId: people.get(proj.accountable),
                  tasks: {
                    create: proj.tasks.map((task) => ({
                      title: task.title,
                      description: task.description,
                      status: task.status,
                      priority: task.priority || "Medium",
                      responsibleId: people.get(task.responsible),
                      dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
                    })),
                  },
                })),
              },
            })),
          },
        })),
      },
    },
  });

  const taskCount = DATA.flatMap((i) => i.programs).flatMap((p) => p.projects).flatMap((pr) => pr.tasks).length;
  console.log(`Imported GCODE workspace: ${DATA.length} initiatives, ${people.size} people, ${taskCount} tasks.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient } from "@prisma/client";
import { slugify } from "../src/lib/slug";

const prisma = new PrismaClient();

async function main() {
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.program.deleteMany();
  await prisma.initiative.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.person.deleteMany();

  const [alex, jordan, priya, sam, morgan] = await Promise.all(
    ["Alex Rivera", "Jordan Lee", "Priya Nair", "Sam Chen", "Morgan Blake"].map((name) =>
      prisma.person.create({ data: { name } })
    )
  );

  const platform = await prisma.workspace.create({
    data: {
      name: "Product Platform",
      slug: slugify("Product Platform"),
      description: "Core platform investments for the product org.",
      status: "On Track",
      accountableId: alex.id,
      initiatives: {
        create: [
          {
            name: "Customer Onboarding Revamp",
            slug: slugify("Customer Onboarding Revamp"),
            description: "Reduce time-to-value for new signups.",
            status: "In Progress",
            accountableId: jordan.id,
            programs: {
              create: [
                {
                  name: "Self-serve Signup",
                  slug: slugify("Self-serve Signup"),
                  description: "Let customers activate without sales.",
                  status: "On Track",
                  accountableId: priya.id,
                  projects: {
                    create: [
                      {
                        name: "Onboarding Wizard",
                        slug: slugify("Onboarding Wizard"),
                        description: "Multi-step signup wizard with progress saves.",
                        status: "In Progress",
                        accountableId: priya.id,
                        tasks: {
                          create: [
                            { title: "Draft onboarding checklist", status: "Not Started", priority: "Medium", responsibleId: sam.id },
                            { title: "Add password strength meter", status: "Not Started", priority: "Low", responsibleId: sam.id },
                            { title: "Wire up API auth", status: "In Progress", priority: "High", responsibleId: priya.id },
                            { title: "Review design intent", status: "Review Pending", priority: "Low", responsibleId: morgan.id },
                            { title: "Fix Safari CSS bug", status: "Paused", priority: "Medium", responsibleId: sam.id },
                            { title: "Set up analytics events", status: "Completed", priority: "Medium", responsibleId: priya.id },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.workspace.create({
    data: {
      name: "Growth & Marketing",
      slug: slugify("Growth & Marketing"),
      description: "Campaigns and lifecycle experiments.",
      status: "At Risk",
      accountableId: jordan.id,
      initiatives: {
        create: [
          {
            name: "Q3 Acquisition Push",
            slug: slugify("Q3 Acquisition Push"),
            status: "In Progress",
            accountableId: morgan.id,
            programs: {
              create: [
                {
                  name: "Paid Channels",
                  slug: slugify("Paid Channels"),
                  status: "At Risk",
                  accountableId: morgan.id,
                  projects: {
                    create: [
                      {
                        name: "Search Ads Refresh",
                        slug: slugify("Search Ads Refresh"),
                        status: "To Do",
                        accountableId: morgan.id,
                        tasks: {
                          create: [
                            { title: "Audit keyword list", status: "Not Started", priority: "High", responsibleId: morgan.id },
                            { title: "Write new ad copy", status: "Not Started", priority: "Medium", responsibleId: jordan.id },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`Seeded: ${platform.name} + Growth & Marketing.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

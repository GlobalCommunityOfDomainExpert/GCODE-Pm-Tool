import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability } from "@/lib/auth/requireCapability";

// Flattened list of every workspace/initiative/program/project, for the
// Scope <select> in the invite/invite-code/edit-user forms.
export const GET = withCapability("Manage Team Members", async () => {
  const [workspaces, initiatives, programs, projects] = await Promise.all([
    prisma.workspace.findMany({ select: { id: true, name: true } }),
    prisma.initiative.findMany({ select: { id: true, name: true } }),
    prisma.program.findMany({ select: { id: true, name: true } }),
    prisma.project.findMany({ select: { id: true, name: true } }),
  ]);

  const options = [
    ...workspaces.map((w) => ({ value: `workspace:${w.id}`, label: `${w.name} (workspace)` })),
    ...initiatives.map((i) => ({ value: `initiative:${i.id}`, label: `${i.name} (initiative)` })),
    ...programs.map((p) => ({ value: `program:${p.id}`, label: `${p.name} (program)` })),
    ...projects.map((p) => ({ value: `project:${p.id}`, label: `${p.name} (project)` })),
  ];

  return NextResponse.json(options);
});

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability } from "@/lib/auth/requireCapability";

// Nested by workspace (so the UI can group the Scope picker one workspace at a
// time - "arrange scopes in groups" - instead of one flat list interleaving
// every workspace's initiatives/programs/projects together). Scoped to the
// caller's own organization only; this previously had no org filter at all.
export const GET = withCapability("Manage Team Members", async (_req, _ctx, user) => {
  const workspaces = await prisma.workspace.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: {
      initiatives: {
        orderBy: { name: "asc" },
        include: {
          programs: {
            orderBy: { name: "asc" },
            include: {
              projects: { orderBy: { name: "asc" }, select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  const tree = workspaces.map((w) => ({
    value: `workspace:${w.id}`,
    label: w.name,
    kind: "workspace" as const,
    children: w.initiatives.map((i) => ({
      value: `initiative:${i.id}`,
      label: i.name,
      kind: "initiative" as const,
      children: i.programs.map((p) => ({
        value: `program:${p.id}`,
        label: p.name,
        kind: "program" as const,
        children: p.projects.map((pr) => ({
          value: `project:${pr.id}`,
          label: pr.name,
          kind: "project" as const,
          children: [],
        })),
      })),
    })),
  }));

  return NextResponse.json(tree);
});

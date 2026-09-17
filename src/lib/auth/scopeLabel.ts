import { prisma } from "@/lib/prisma";
import { parseScope } from "./scope";

// Human label for a scope string, e.g. "Product Platform (workspace)" -
// used by the temp-code join preview so people see what they're about to get.
export async function findNodeLabelForScope(scope: string): Promise<string | null> {
  const parsed = parseScope(scope);
  if (!parsed) return null;

  const { kind, id } = parsed;
  const row =
    kind === "workspace"
      ? await prisma.workspace.findUnique({ where: { id }, select: { name: true } })
      : kind === "initiative"
        ? await prisma.initiative.findUnique({ where: { id }, select: { name: true } })
        : kind === "program"
          ? await prisma.program.findUnique({ where: { id }, select: { name: true } })
          : await prisma.project.findUnique({ where: { id }, select: { name: true } });

  return row ? `${row.name} (${kind})` : null;
}

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseScope } from "./scope";

// Human label for a scope string, e.g. "Product Platform (workspace)" -
// used by the temp-code join preview so people see what they're about to get,
// and by (app)/layout.tsx's header on every navigation. Depends only on the
// scoped node's own name, so it's cached tagged `node:${kind}:${id}` - the
// same tag the node's own PATCH (rename) route revalidates - with a
// 5-minute revalidate as a safety net.
export async function findNodeLabelForScope(scope: string): Promise<string | null> {
  const parsed = parseScope(scope);
  if (!parsed) return null;
  const { kind, id } = parsed;

  return unstable_cache(
    async () => {
      const row =
        kind === "workspace"
          ? await prisma.workspace.findUnique({ where: { id }, select: { name: true } })
          : kind === "initiative"
            ? await prisma.initiative.findUnique({ where: { id }, select: { name: true } })
            : kind === "program"
              ? await prisma.program.findUnique({ where: { id }, select: { name: true } })
              : await prisma.project.findUnique({ where: { id }, select: { name: true } });

      return row ? `${row.name} (${kind})` : null;
    },
    [`scopeLabel:${kind}:${id}`],
    { tags: [`node:${kind}:${id}`], revalidate: 300 }
  )();
}

// Name an outgoing email should use to say who the recipient is joining.
// The org name is only for people with org-wide standing (Admin, or no
// scope = whole org); everyone else is named by their scope node only, so
// org identity isn't disclosed to someone who only sees one slice of it.
export async function mailDisplayName(user: { organizationId: string; roles: string[]; scope: string | null }): Promise<string> {
  const orgWide = user.roles.includes("Admin") || !user.scope;
  if (orgWide) {
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } });
    return org?.name || "your organization";
  }
  return (await findNodeLabelForScope(user.scope!)) || "your assigned scope";
}

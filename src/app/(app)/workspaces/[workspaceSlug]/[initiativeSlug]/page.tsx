import { notFound } from "next/navigation";
import { getWorkspaceTree, scopeFilterWorkspace, toCardItem, toTreeNode } from "@/lib/tree";
import { requireUser } from "@/lib/auth/session";
import { buildPermResolver, getPerms, stampPerms } from "@/lib/auth/perms";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";
import { HierarchyLevelClient } from "@/components/HierarchyLevelClient";

export const dynamic = "force-dynamic";

export default async function ProgramsPage({
  params,
}: {
  params: { workspaceSlug: string; initiativeSlug: string };
}) {
  const user = await requireUser();
  const fetched = await getWorkspaceTree(params.workspaceSlug, user.organizationId);
  const workspace = await scopeFilterWorkspace(fetched, user.assignments);
  const initiative = workspace?.initiatives.find((i) => i.slug === params.initiativeSlug);
  if (!workspace || !initiative) notFound();
  stampPerms(workspace as never, "workspace", await buildPermResolver(user));

  const basePath = `/workspaces/${workspace.slug}/${initiative.slug}`;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "All Workspaces", href: "/workspaces" },
          { label: workspace.name, href: `/workspaces/${workspace.slug}` },
          { label: initiative.name, href: basePath },
        ]}
      />
      <PageHeader title={initiative.name} description={initiative.description} logoData={workspace.logoData} />
      <HierarchyLevelClient
        items={initiative.programs.map(toCardItem)}
        treeItems={initiative.programs.map((p) => toTreeNode(p, "program"))}
        level="program"
        childLevel="project"
        basePath={basePath}
        parentId={initiative.id}
        canCreate={getPerms(initiative).createChild}
      />
    </div>
  );
}

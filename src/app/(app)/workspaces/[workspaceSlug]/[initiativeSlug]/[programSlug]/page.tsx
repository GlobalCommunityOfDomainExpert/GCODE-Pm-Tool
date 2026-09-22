import { notFound } from "next/navigation";
import { getWorkspaceTree, scopeFilterWorkspace, toCardItem, toTreeNode } from "@/lib/tree";
import { getSessionUserCached } from "@/lib/auth/session";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";
import { HierarchyLevelClient } from "@/components/HierarchyLevelClient";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  params,
}: {
  params: { workspaceSlug: string; initiativeSlug: string; programSlug: string };
}) {
  const user = (await getSessionUserCached())!;
  const fetched = await getWorkspaceTree(params.workspaceSlug, user.organizationId);
  const workspace = await scopeFilterWorkspace(fetched, user.scope);
  const initiative = workspace?.initiatives.find((i) => i.slug === params.initiativeSlug);
  const program = initiative?.programs.find((p) => p.slug === params.programSlug);
  if (!workspace || !initiative || !program) notFound();

  const basePath = `/workspaces/${workspace.slug}/${initiative.slug}/${program.slug}`;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "All Workspaces", href: "/workspaces" },
          { label: workspace.name, href: `/workspaces/${workspace.slug}` },
          { label: initiative.name, href: `/workspaces/${workspace.slug}/${initiative.slug}` },
          { label: program.name, href: basePath },
        ]}
      />
      <PageHeader title={program.name} description={program.description} logoData={workspace.logoData} />
      <HierarchyLevelClient
        items={program.projects.map(toCardItem)}
        treeItems={program.projects.map((p) => toTreeNode(p, "project"))}
        level="project"
        childLevel="task"
        basePath={basePath}
        parentId={program.id}
      />
    </div>
  );
}

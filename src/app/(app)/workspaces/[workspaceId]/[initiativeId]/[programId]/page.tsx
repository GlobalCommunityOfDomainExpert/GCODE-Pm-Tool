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
  params: { workspaceId: string; initiativeId: string; programId: string };
}) {
  const user = (await getSessionUserCached())!;
  const fetched = await getWorkspaceTree(params.workspaceId, user.organizationId);
  const workspace = await scopeFilterWorkspace(fetched, user.scope);
  const initiative = workspace?.initiatives.find((i) => i.id === params.initiativeId);
  const program = initiative?.programs.find((p) => p.id === params.programId);
  if (!workspace || !initiative || !program) notFound();

  const basePath = `/workspaces/${workspace.id}/${initiative.id}/${program.id}`;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "All Workspaces", href: "/workspaces" },
          { label: workspace.name, href: `/workspaces/${workspace.id}` },
          { label: initiative.name, href: `/workspaces/${workspace.id}/${initiative.id}` },
          { label: program.name, href: basePath },
        ]}
      />
      <PageHeader title={program.name} description={program.description} />
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

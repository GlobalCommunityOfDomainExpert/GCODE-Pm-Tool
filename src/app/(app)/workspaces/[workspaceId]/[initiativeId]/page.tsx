import { notFound } from "next/navigation";
import { getWorkspaceTree, scopeFilterWorkspace, toCardItem, toTreeNode } from "@/lib/tree";
import { getSessionUserCached } from "@/lib/auth/session";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";
import { HierarchyLevelClient } from "@/components/HierarchyLevelClient";

export const dynamic = "force-dynamic";

export default async function ProgramsPage({
  params,
}: {
  params: { workspaceId: string; initiativeId: string };
}) {
  const user = (await getSessionUserCached())!;
  const fetched = await getWorkspaceTree(params.workspaceId, user.organizationId);
  const workspace = await scopeFilterWorkspace(fetched, user.scope);
  const initiative = workspace?.initiatives.find((i) => i.id === params.initiativeId);
  if (!workspace || !initiative) notFound();

  const basePath = `/workspaces/${workspace.id}/${initiative.id}`;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "All Workspaces", href: "/workspaces" },
          { label: workspace.name, href: `/workspaces/${workspace.id}` },
          { label: initiative.name, href: basePath },
        ]}
      />
      <PageHeader title={initiative.name} description={initiative.description} />
      <HierarchyLevelClient
        items={initiative.programs.map(toCardItem)}
        treeItems={initiative.programs.map((p) => toTreeNode(p, "program"))}
        level="program"
        childLevel="project"
        basePath={basePath}
        parentId={initiative.id}
      />
    </div>
  );
}

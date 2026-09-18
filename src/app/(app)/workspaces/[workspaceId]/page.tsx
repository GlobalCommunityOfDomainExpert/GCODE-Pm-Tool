import { notFound } from "next/navigation";
import { getWorkspaceTree, scopeFilterWorkspace, toCardItem, toTreeNode } from "@/lib/tree";
import { getSessionUser } from "@/lib/auth/session";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";
import { HierarchyLevelClient } from "@/components/HierarchyLevelClient";

export const dynamic = "force-dynamic";

export default async function InitiativesPage({ params }: { params: { workspaceId: string } }) {
  const user = (await getSessionUser())!;
  const fetched = await getWorkspaceTree(params.workspaceId, user.organizationId);
  const workspace = await scopeFilterWorkspace(fetched, user.scope);
  if (!workspace) notFound();

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "All Workspaces", href: "/workspaces" },
          { label: workspace.name, href: `/workspaces/${workspace.id}` },
        ]}
      />
      <PageHeader title={workspace.name} description={workspace.description} />
      <HierarchyLevelClient
        items={workspace.initiatives.map(toCardItem)}
        treeItems={workspace.initiatives.map((i) => toTreeNode(i, "initiative"))}
        level="initiative"
        childLevel="program"
        basePath={`/workspaces/${workspace.id}`}
        parentId={workspace.id}
      />
    </div>
  );
}

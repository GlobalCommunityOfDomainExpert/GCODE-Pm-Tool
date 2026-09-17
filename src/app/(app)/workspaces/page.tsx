import { getAllWorkspaces, toCardItem, toTreeNode } from "@/lib/tree";
import { getSessionUser } from "@/lib/auth/session";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";
import { HierarchyLevelClient } from "@/components/HierarchyLevelClient";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const user = (await getSessionUser())!; // (app)/layout.tsx already guarantees a session here
  const workspaces = await getAllWorkspaces(user.organizationId);

  return (
    <div>
      <Breadcrumbs items={[{ label: "All Workspaces", href: "/workspaces" }]} />
      <PageHeader title="All Workspaces" />
      <HierarchyLevelClient
        items={workspaces.map(toCardItem)}
        treeItems={workspaces.map((w) => toTreeNode(w, "workspace"))}
        level="workspace"
        childLevel="initiative"
        basePath="/workspaces"
        parentId={null}
      />
    </div>
  );
}

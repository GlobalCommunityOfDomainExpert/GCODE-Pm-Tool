import { getAllWorkspaces, scopeFilterWorkspaces, toCardItem, toTreeNode } from "@/lib/tree";
import { requireUser } from "@/lib/auth/session";
import { buildPermResolver, getPerms, stampPerms } from "@/lib/auth/perms";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";
import { HierarchyLevelClient } from "@/components/HierarchyLevelClient";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const user = await requireUser();
  const allWorkspaces = await getAllWorkspaces(user.organizationId);
  const workspaces = await scopeFilterWorkspaces(allWorkspaces, user.assignments);
  const resolver = await buildPermResolver(user);
  workspaces.forEach((w) => stampPerms(w as never, "workspace", resolver));

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
        canCreate={resolver.canCreateWorkspace}
      />
    </div>
  );
}

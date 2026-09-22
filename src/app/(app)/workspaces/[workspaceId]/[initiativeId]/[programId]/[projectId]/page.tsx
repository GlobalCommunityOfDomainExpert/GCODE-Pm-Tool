import { notFound } from "next/navigation";
import { getWorkspaceTree, scopeFilterWorkspace, toTaskItem } from "@/lib/tree";
import { getSessionUserCached } from "@/lib/auth/session";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";
import { TaskKanbanBoard } from "@/components/TaskKanbanBoard";

export const dynamic = "force-dynamic";

export default async function TaskBoardPage({
  params,
}: {
  params: { workspaceId: string; initiativeId: string; programId: string; projectId: string };
}) {
  const user = (await getSessionUserCached())!;
  const fetched = await getWorkspaceTree(params.workspaceId, user.organizationId);
  const workspace = await scopeFilterWorkspace(fetched, user.scope);
  const initiative = workspace?.initiatives.find((i) => i.id === params.initiativeId);
  const program = initiative?.programs.find((p) => p.id === params.programId);
  const project = program?.projects.find((p) => p.id === params.projectId);
  if (!workspace || !initiative || !program || !project) notFound();

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "All Workspaces", href: "/workspaces" },
          { label: workspace.name, href: `/workspaces/${workspace.id}` },
          { label: initiative.name, href: `/workspaces/${workspace.id}/${initiative.id}` },
          { label: program.name, href: `/workspaces/${workspace.id}/${initiative.id}/${program.id}` },
          { label: project.name, href: `/workspaces/${workspace.id}/${initiative.id}/${program.id}/${project.id}` },
        ]}
      />
      <PageHeader title={project.name} description={project.description} logoData={workspace.logoData} />
      <TaskKanbanBoard projectId={project.id} initialTasks={project.tasks.map(toTaskItem)} />
    </div>
  );
}

import { notFound } from "next/navigation";
import { getWorkspaceTree, toTaskItem } from "@/lib/tree";
import { getSessionUser } from "@/lib/auth/session";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";
import { TaskKanbanBoard } from "@/components/TaskKanbanBoard";

export const dynamic = "force-dynamic";

export default async function TaskBoardPage({
  params,
}: {
  params: { workspaceId: string; initiativeId: string; programId: string; projectId: string };
}) {
  const user = (await getSessionUser())!;
  const workspace = await getWorkspaceTree(params.workspaceId, user.organizationId);
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
      <PageHeader title={project.name} description={project.description} />
      <TaskKanbanBoard projectId={project.id} initialTasks={project.tasks.map(toTaskItem)} />
    </div>
  );
}

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
  params: { workspaceSlug: string; initiativeSlug: string; programSlug: string; projectSlug: string };
}) {
  const user = (await getSessionUserCached())!;
  const fetched = await getWorkspaceTree(params.workspaceSlug, user.organizationId);
  const workspace = await scopeFilterWorkspace(fetched, user.scope);
  const initiative = workspace?.initiatives.find((i) => i.slug === params.initiativeSlug);
  const program = initiative?.programs.find((p) => p.slug === params.programSlug);
  const project = program?.projects.find((p) => p.slug === params.projectSlug);
  if (!workspace || !initiative || !program || !project) notFound();

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "All Workspaces", href: "/workspaces" },
          { label: workspace.name, href: `/workspaces/${workspace.slug}` },
          { label: initiative.name, href: `/workspaces/${workspace.slug}/${initiative.slug}` },
          { label: program.name, href: `/workspaces/${workspace.slug}/${initiative.slug}/${program.slug}` },
          {
            label: project.name,
            href: `/workspaces/${workspace.slug}/${initiative.slug}/${program.slug}/${project.slug}`,
          },
        ]}
      />
      <PageHeader title={project.name} description={project.description} logoData={workspace.logoData} />
      <TaskKanbanBoard projectId={project.id} initialTasks={project.tasks.map(toTaskItem)} />
    </div>
  );
}

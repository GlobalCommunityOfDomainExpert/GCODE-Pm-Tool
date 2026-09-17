import { prisma } from "./prisma";
import type { HierarchyCardItem, HierarchyLevel, Person, TaskItem, TreeNode } from "./types";

// v0.1's data volume is six small tables (per spec section 6), so a single deep
// include down to tasks is cheap and keeps progress/child-count math in one place
// instead of N+1 querying per level.
const DEEP_INCLUDE = {
  accountable: true,
  programs: {
    include: {
      accountable: true,
      projects: {
        include: {
          accountable: true,
          tasks: { include: { responsible: true } },
        },
      },
    },
  },
} as const;

// organizationId is required (not optional) on both reads below - there is no
// legitimate cross-org read of the workspace tree, ever, regardless of role.
// A mismatched workspaceId (wrong org, or someone else's org entirely) returns
// null exactly like a nonexistent id would, so callers already handle it via
// their existing not-found path with no extra branching.
export async function getWorkspaceTree(workspaceId: string, organizationId: string) {
  return prisma.workspace.findFirst({
    where: { id: workspaceId, organizationId },
    include: {
      accountable: true,
      initiatives: { include: DEEP_INCLUDE },
    },
  });
}

export async function getAllWorkspaces(organizationId: string) {
  return prisma.workspace.findMany({
    where: { organizationId },
    include: {
      accountable: true,
      initiatives: { include: DEEP_INCLUDE },
    },
    orderBy: { createdAt: "asc" },
  });
}

type AnyTask = { status: string };
type AnyProject = { tasks: AnyTask[] };
type AnyProgram = { projects: AnyProject[] };
type AnyInitiative = { programs: AnyProgram[] };
type AnyWorkspace = { initiatives: AnyInitiative[] };

function collectTasks(node: unknown): AnyTask[] {
  if (!node || typeof node !== "object") return [];
  if ("tasks" in node) return (node as AnyProject).tasks;
  if ("projects" in node) return (node as AnyProgram).projects.flatMap(collectTasks);
  if ("programs" in node) return (node as AnyInitiative).programs.flatMap(collectTasks);
  if ("initiatives" in node) return (node as AnyWorkspace).initiatives.flatMap(collectTasks);
  return [];
}

function progressOf(node: unknown) {
  const tasks = collectTasks(node);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "Completed").length;
  return { total, done, progress: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function childCountOf(node: { initiatives?: unknown[]; programs?: unknown[]; projects?: unknown[]; tasks?: unknown[] }) {
  if (node.initiatives) return node.initiatives.length;
  if (node.programs) return node.programs.length;
  if (node.projects) return node.projects.length;
  if (node.tasks) return node.tasks.length;
  return 0;
}

function toPerson(p: { id: string; name: string } | null): Person | null {
  return p ? { id: p.id, name: p.name } : null;
}

export function toCardItem(node: {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  accountable: { id: string; name: string } | null;
  initiatives?: unknown[];
  programs?: unknown[];
  projects?: unknown[];
  tasks?: unknown[];
}): HierarchyCardItem {
  const { total, done, progress } = progressOf(node);
  return {
    id: node.id,
    name: node.name,
    description: node.description,
    status: node.status,
    accountable: toPerson(node.accountable),
    childCount: childCountOf(node),
    progress,
    done,
    total,
  };
}

// Generic source shape covering every level's Prisma include result: each
// level carries either `name` (containers) or `title` (tasks), and its own
// child array under a level-specific key - structurally compatible with the
// actual Prisma types returned by getAllWorkspaces()/getWorkspaceTree()
// (extra fields like description/createdAt are simply ignored here).
type TreeSourceNode = {
  id: string;
  name?: string | null;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  dueDate?: Date | null;
  accountable?: { id: string; name: string } | null;
  responsible?: { id: string; name: string } | null;
  initiatives?: TreeSourceNode[];
  programs?: TreeSourceNode[];
  projects?: TreeSourceNode[];
  tasks?: TreeSourceNode[];
};

const CHILD_KEY_FOR_LEVEL: Partial<Record<HierarchyLevel, "initiatives" | "programs" | "projects" | "tasks">> = {
  workspace: "initiatives",
  initiative: "programs",
  program: "projects",
  project: "tasks",
};

const CHILD_LEVEL_FOR_LEVEL: Partial<Record<HierarchyLevel, HierarchyLevel>> = {
  workspace: "initiative",
  initiative: "program",
  program: "project",
  project: "task",
};

export function toTreeNode(node: TreeSourceNode, level: HierarchyLevel): TreeNode {
  const isTask = level === "task";
  const childKey = CHILD_KEY_FOR_LEVEL[level];
  const childLevel = CHILD_LEVEL_FOR_LEVEL[level];
  const rawChildren = childKey ? node[childKey] || [] : [];
  const children = childLevel ? rawChildren.map((c) => toTreeNode(c, childLevel)) : [];
  const progress = isTask ? (node.status === "Completed" ? 100 : 0) : progressOf(node).progress;

  return {
    id: node.id,
    level,
    name: (isTask ? node.title : node.name) || "",
    status: node.status ?? null,
    accountable: toPerson((isTask ? node.responsible : node.accountable) ?? null),
    priority: isTask ? node.priority ?? null : null,
    dueDate: isTask && node.dueDate ? new Date(node.dueDate).toISOString().slice(0, 10) : null,
    progress,
    children,
  };
}

export function toTaskItem(t: {
  id: string;
  title: string;
  status: string;
  priority: string;
  responsible: { id: string; name: string } | null;
  description: string | null;
  startDate: Date | null;
  dueDate: Date | null;
}): TaskItem {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    responsible: toPerson(t.responsible),
    description: t.description,
    startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
  };
}

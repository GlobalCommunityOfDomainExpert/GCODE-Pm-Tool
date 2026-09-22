import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { getScopeChain } from "./auth/scope";
import type { HierarchyCardItem, HierarchyLevel, Assignee, TaskItem, TreeNode } from "./types";

// Accountable/responsible now point at User, which also carries
// passwordHash/inviteTokenHash/etc - select only the fields the UI needs
// instead of `include: { accountable: true }`, everywhere it's fetched.
const ASSIGNEE_SELECT = { select: { id: true, name: true, email: true } } as const;

// v0.1's data volume is six small tables (per spec section 6), so a single deep
// include down to tasks is cheap and keeps progress/child-count math in one place
// instead of N+1 querying per level.
const DEEP_INCLUDE = {
  accountable: ASSIGNEE_SELECT,
  programs: {
    include: {
      accountable: ASSIGNEE_SELECT,
      projects: {
        include: {
          accountable: ASSIGNEE_SELECT,
          tasks: { include: { responsible: ASSIGNEE_SELECT } },
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
// This deep include is re-run on every navigation into a hierarchy page
// (all of them are force-dynamic, no route-level cache). Data-layer caching
// via unstable_cache, tagged per org, buys back that DB round trip on
// repeat navigations without touching force-dynamic itself - every
// create/update/delete under this org's tree (workspaces/route.ts,
// initiatives/[id]/route.ts, etc. - see revalidateTag(`tree:${organizationId}`)
// call sites) invalidates the tag, and a 5-minute revalidate is a self-heal
// safety net in case any write path is ever added without that call.
// unstable_cache's `tags`/keyParts must be static per call to the wrapper,
// so the wrapper is created fresh inside each exported function (the
// standard pattern for a per-argument cache tag) rather than once at module
// scope.
export async function getWorkspaceTree(workspaceSlug: string, organizationId: string) {
  return unstable_cache(
    async () =>
      prisma.workspace.findFirst({
        where: { slug: workspaceSlug, organizationId },
        include: {
          accountable: ASSIGNEE_SELECT,
          initiatives: { include: DEEP_INCLUDE },
        },
      }),
    [`tree:getWorkspaceTree:${workspaceSlug}:${organizationId}`],
    { tags: [`tree:${organizationId}`], revalidate: 300 }
  )();
}

export async function getAllWorkspaces(organizationId: string) {
  return unstable_cache(
    async () =>
      prisma.workspace.findMany({
        where: { organizationId },
        include: {
          accountable: ASSIGNEE_SELECT,
          initiatives: { include: DEEP_INCLUDE },
        },
        orderBy: { createdAt: "asc" },
      }),
    [`tree:getAllWorkspaces:${organizationId}`],
    { tags: [`tree:${organizationId}`], revalidate: 300 }
  )();
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

function toAssignee(p: { id: string; name: string; email: string | null } | null): Assignee | null {
  return p ? { id: p.id, name: p.name, email: p.email } : null;
}

export function toCardItem(node: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string | null;
  accountable: { id: string; name: string; email: string | null } | null;
  logoData?: string | null;
  initiatives?: unknown[];
  programs?: unknown[];
  projects?: unknown[];
  tasks?: unknown[];
}): HierarchyCardItem {
  const { total, done, progress } = progressOf(node);
  return {
    id: node.id,
    slug: node.slug,
    name: node.name,
    description: node.description,
    status: node.status,
    accountable: toAssignee(node.accountable),
    logoData: node.logoData ?? null,
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
  slug?: string; // absent for a task - Task has no slug column, no route of its own
  name?: string | null;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  dueDate?: Date | null;
  accountable?: { id: string; name: string; email: string | null } | null;
  responsible?: { id: string; name: string; email: string | null } | null;
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

// Prunes an array of same-level nodes down to what a scoped user may see:
// - Above the scope root (not yet `insideSubtree`): only the single sibling
//   that sits on the path to the scope root survives at each level - this is
//   the "ancestors, for breadcrumb context only" half of the rule, so a
//   Program-scoped user's Initiative page shows exactly one Initiative
//   (theirs), not every Initiative in the workspace.
// - At or below the scope root (`insideSubtree`): everything survives
//   unfiltered - the scope root's full subtree is fully visible.
// Mutates each kept node's child array in place (fresh query result per
// request, so this is safe) and recurses one level at a time using the
// same child-key maps toTreeNode/toCardItem already rely on.
function pruneNodes<T extends { id: string }>(
  nodes: T[],
  level: HierarchyLevel,
  chain: string[],
  depth: number,
  insideSubtree: boolean
): T[] {
  const kept = insideSubtree ? nodes : nodes.filter((n) => n.id === chain[depth]);

  const childKey = CHILD_KEY_FOR_LEVEL[level];
  const childLevel = CHILD_LEVEL_FOR_LEVEL[level];
  if (!childKey || !childLevel) return kept;

  const childInsideSubtree = insideSubtree || depth === chain.length - 1;
  for (const n of kept) {
    const rec = n as unknown as Record<string, unknown>;
    const children = (rec[childKey] as T[] | undefined) || [];
    rec[childKey] = pruneNodes(children, childLevel, chain, depth + 1, childInsideSubtree);
  }
  return kept;
}

// Applies scope-based read filtering to a full workspaces list (top-level
// entry point, e.g. getAllWorkspaces()'s result). `scope: null` (Admin /
// unscoped roles) returns the input untouched.
export async function scopeFilterWorkspaces<T extends { id: string }>(workspaces: T[], scope: string | null): Promise<T[]> {
  const chain = await getScopeChain(scope);
  if (chain === null) return workspaces;
  return pruneNodes(workspaces, "workspace", chain, 0, false);
}

// Same, for a single workspace tree (getWorkspaceTree()'s result). Returns
// null both when the input was null (not found / wrong org) and when the
// workspace exists but isn't visible under the caller's scope - callers
// already treat "null here" as their existing notFound() path, so a direct
// URL visit to something outside scope 404s exactly like a nonexistent id.
export async function scopeFilterWorkspace<T extends { id: string }>(workspace: T | null, scope: string | null): Promise<T | null> {
  if (!workspace) return null;
  const chain = await getScopeChain(scope);
  if (chain === null) return workspace;
  const [pruned] = pruneNodes([workspace], "workspace", chain, 0, false);
  return pruned ?? null;
}

export function toTreeNode(node: TreeSourceNode, level: HierarchyLevel): TreeNode {
  const isTask = level === "task";
  const childKey = CHILD_KEY_FOR_LEVEL[level];
  const childLevel = CHILD_LEVEL_FOR_LEVEL[level];
  const rawChildren = childKey ? node[childKey] || [] : [];
  const children = childLevel ? rawChildren.map((c) => toTreeNode(c, childLevel)) : [];
  const progress = isTask ? (node.status === "Completed" ? 100 : 0) : progressOf(node).progress;

  return {
    id: node.id,
    slug: node.slug ?? "",
    level,
    name: (isTask ? node.title : node.name) || "",
    status: node.status ?? null,
    accountable: toAssignee((isTask ? node.responsible : node.accountable) ?? null),
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
  responsible: { id: string; name: string; email: string | null } | null;
  description: string | null;
  startDate: Date | string | null;
  dueDate: Date | string | null;
}): TaskItem {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    responsible: toAssignee(t.responsible),
    description: t.description,
    // t comes from getWorkspaceTree/getAllWorkspaces, which are wrapped in
    // unstable_cache - on a cache hit, Next round-trips the cached value
    // through JSON, so Date fields come back as plain ISO strings instead
    // of Date instances (only a cache MISS hands back real Dates straight
    // from Prisma). new Date(...) normalizes either shape before calling
    // a Date-only method - matches the pattern toTreeNode already used
    // correctly for its own dueDate a few lines up.
    startDate: t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : null,
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null,
  };
}

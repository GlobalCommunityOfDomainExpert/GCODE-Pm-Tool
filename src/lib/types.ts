export type HierarchyLevel = "workspace" | "initiative" | "program" | "project" | "task";

export const LEVEL_LABEL: Record<HierarchyLevel, string> = {
  workspace: "Workspace",
  initiative: "Initiative",
  program: "Program",
  project: "Project",
  task: "Task",
};

// Containers (L1-L4) reuse this shape; tasks (L5) are rendered by the Kanban board instead.
export const CONTAINER_STATUSES = ["On Track", "At Risk", "In Progress", "To Do"] as const;
export const TASK_STATUSES = ["Not Started", "In Progress", "Review Pending", "Paused", "Completed", "Yet To Update"] as const;
export const TASK_PRIORITIES = ["High", "Medium", "Low"] as const;

export interface Person {
  id: string;
  name: string;
}

export interface HierarchyCardItem {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  accountable: Person | null;
  childCount: number;
  progress: number;
  done: number;
  total: number;
}

export interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  responsible: Person | null;
  description: string | null;
  startDate: string | null;
  dueDate: string | null;
}

export interface Breadcrumb {
  label: string;
  href: string;
}

// Recursive shape for the List/Tree view (FR-2) - unlike HierarchyCardItem
// (one flat level, used by Card view) this carries the full subtree so the
// tree table can expand/collapse arbitrarily deep in one client component.
export interface TreeNode {
  id: string;
  level: HierarchyLevel;
  name: string;
  status: string | null;
  accountable: Person | null;
  priority: string | null; // tasks only
  dueDate: string | null; // tasks only
  progress: number;
  children: TreeNode[];
}

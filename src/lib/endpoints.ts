import type { HierarchyLevel } from "./types";

export const LEVEL_ENDPOINT: Record<HierarchyLevel, string> = {
  workspace: "/api/workspaces",
  initiative: "/api/initiatives",
  program: "/api/programs",
  project: "/api/projects",
  task: "/api/tasks",
};

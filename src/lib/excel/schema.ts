import type { HierarchyLevel } from "@/lib/types";

// The one definition of the Excel layout. Export writes it, import reads it,
// the Instructions sheet documents it - all from these constants.
export const SHEET_HIERARCHY = "Hierarchy";
export const SHEET_INSTRUCTIONS = "Instructions";
export const SHEET_LISTS = "Lists";
export const SHEET_META = "_meta";

// Bump when columns change; import rejects files from another version.
export const TEMPLATE_VERSION = 1;

// Ancestor names are joined with this in "Parent Path". Names containing it
// are rejected, so a path always splits back unambiguously.
export const PATH_SEP = " > ";

export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const LEVELS: HierarchyLevel[] = ["workspace", "initiative", "program", "project", "task"];
export const LEVEL_NO: Record<HierarchyLevel, number> = { workspace: 1, initiative: 2, program: 3, project: 4, task: 5 };
export const LEVEL_NAMES: Record<HierarchyLevel, string> = {
  workspace: "Workspace",
  initiative: "Initiative",
  program: "Program",
  project: "Project",
  task: "Task",
};

export type ColumnKey = "id" | "level" | "parentPath" | "name" | "description" | "status" | "owner" | "priority" | "startDate" | "dueDate";

export const COLUMNS: { key: ColumnKey; header: string; width: number; note: string }[] = [
  { key: "id", header: "ID (system)", width: 28, note: "Filled on export. Leave BLANK for new rows. Never edit or copy it." },
  { key: "level", header: "Level", width: 14, note: "Workspace, Initiative, Program, Project or Task (pick from the dropdown)." },
  { key: "parentPath", header: "Parent Path", width: 48, note: `Names of all ancestors joined with "${PATH_SEP.trim()}". Blank for a Workspace.` },
  { key: "name", header: "Name", width: 34, note: "Required. Task = its title. Max 60 characters." },
  { key: "description", header: "Description", width: 40, note: "Optional. Max 255 characters. Blank clears it." },
  { key: "status", header: "Status", width: 16, note: "Project and Task only. Blank on a Task keeps its current status (new Task: Not Started)." },
  { key: "owner", header: "Owner Email", width: 30, note: "Accountable (containers) / Responsible (task). Must be an active teammate with scope. Blank clears." },
  { key: "priority", header: "Priority", width: 11, note: "Task only: High, Medium or Low (blank = keep / Medium)." },
  { key: "startDate", header: "Start Date", width: 13, note: "Task only. Date or yyyy-mm-dd." },
  { key: "dueDate", header: "Due Date", width: 13, note: "Task only. Date or yyyy-mm-dd. Not before Start Date." },
];

export interface ImportRow {
  rowNo: number; // 1-based sheet row, for error messages
  id: string;
  level: string;
  parentPath: string;
  name: string;
  description: string;
  status: string;
  owner: string;
  priority: string;
  startDate: string; // normalised yyyy-mm-dd or raw text (validated in plan)
  dueDate: string;
}

export interface RowIssue {
  row: number; // 0 = file-level
  column?: string;
  message: string;
}

export const headerOf = (key: ColumnKey) => COLUMNS.find((c) => c.key === key)!.header;

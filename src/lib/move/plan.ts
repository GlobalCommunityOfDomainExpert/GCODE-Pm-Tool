import type { HierarchyLevel } from "@/lib/types";
import { NAME_MAX } from "@/lib/limits";

// Pure move rules - no DB, no React - so the exact same function validates the
// live modal in the browser and the real write on the server. If they ever
// disagreed, the server (which re-runs this) wins.

export const LEVEL_ORDER: HierarchyLevel[] = ["workspace", "initiative", "program", "project", "task"];

export function levelNo(level: HierarchyLevel): number {
  return LEVEL_ORDER.indexOf(level) + 1;
}

export function levelAt(no: number): HierarchyLevel {
  return LEVEL_ORDER[no - 1];
}

export interface MoveNode {
  id: string;
  level: HierarchyLevel;
  name: string;
  children: MoveNode[];
}

export interface PlacedNode {
  id: string;
  name: string;
  fromLevel: HierarchyLevel;
  toLevel: HierarchyLevel;
}

export interface MoveCheck {
  ok: boolean;
  errors: string[];
  // New level of the moved root had it not been deleted (target level + 1).
  newRootLevel: number;
  // How many levels the subtree shifts down (negative = up).
  shift: number;
  // True when, with nothing removed, the subtree would run past L5 (shift > 0).
  needsRemoval: boolean;
  // Moving up with tasks inside: containers that must be created between each
  // task-holding branch and its tasks (tasks must sit directly under a
  // Project). Listed top to bottom.
  fillLevels: HierarchyLevel[];
  // How many branches get those new containers (task-holding projects, or 1 for a task).
  fillBranches: number;
  // Surviving containers whose level changes (they get a new row in another table).
  converted: PlacedNode[];
  // Containers whose level is unchanged (only their parent changes).
  kept: PlacedNode[];
  deleted: { id: string; name: string; level: HierarchyLevel }[];
}

export function findNode(root: MoveNode, id: string): MoveNode | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

export function countTasks(node: MoveNode): number {
  if (node.level === "task") return 1;
  return node.children.reduce((n, c) => n + countTasks(c), 0);
}

export function flatten(node: MoveNode): MoveNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

// Levels to create when `source` ends up higher than it was (shift < 0) while
// holding tasks. Empty when nothing is needed.
export function fillLevelsFor(source: MoveNode, targetLevel: number): HierarchyLevel[] {
  const shift = targetLevel + 1 - levelNo(source.level);
  if (shift >= 0 || countTasks(source) === 0) return [];
  // Lowest container of a subtree lands at 4 + shift; a lone task goes straight under the target.
  const first = source.level === "task" ? targetLevel + 1 : 5 + shift;
  const out: HierarchyLevel[] = [];
  for (let l = first; l <= 4; l++) out.push(levelAt(l));
  return out;
}

// source: the item being moved with its full subtree.
// targetLevel: level number (1-4) of the chosen new parent.
// deleteIds: nodes of the subtree the person chose to remove (their children
//   move up to the removed node's parent) - only for moves that shift DOWN past L5.
// fillNames: names for the containers created when moving UP with tasks inside
//   (one per fillLevels entry, applied to every affected branch).
//
// Rules, per branch:
//  - a Task always ends up at exactly L5 (directly under a Project) and is never removable
//  - every container ends up at L4 or higher
//  - moving down: each root-to-Task path must lose exactly `shift` nodes
//  - moving up: `-shift` new containers are inserted above each branch's tasks
export function checkMove(
  source: MoveNode,
  targetLevel: number,
  deleteIds: ReadonlySet<string>,
  fillNames: readonly string[] = []
): MoveCheck {
  const errors: string[] = [];
  const newRootLevel = targetLevel + 1;
  const shift = newRootLevel - levelNo(source.level);

  const converted: PlacedNode[] = [];
  const kept: PlacedNode[] = [];
  const deleted: MoveCheck["deleted"] = [];
  const reported = new Set<string>();
  const fillLevels = fillLevelsFor(source, targetLevel);
  const fillBranches =
    fillLevels.length === 0 ? 0 : source.level === "task" ? 1 : flatten(source).filter((n) => n.level === "project" && n.children.length > 0).length;

  function walk(node: MoveNode, deletedAbove: number) {
    const orig = levelNo(node.level);
    if (deleteIds.has(node.id)) {
      if (node.level === "task") errors.push("Tasks can't be removed - they are always kept.");
      else deleted.push({ id: node.id, name: node.name, level: node.level });
      for (const c of node.children) walk(c, deletedAbove + 1);
      return;
    }

    const now = orig + shift - deletedAbove;
    if (node.level === "task") {
      // Moving up, the created containers carry the task back to L5.
      if (shift >= 0 && now !== 5 && !reported.has("task")) {
        reported.add("task");
        errors.push(
          now > 5
            ? "Some tasks would fall below level 5 - remove more levels on those branches."
            : "Some tasks would end up above level 5 - remove fewer levels on those branches."
        );
      }
      return;
    }
    if (now > 4 && !reported.has(node.id)) {
      reported.add(node.id);
      errors.push(`"${node.name}" would end up at level ${now} - remove a level above it.`);
    }
    const toLevel = levelAt(Math.min(Math.max(now, 1), 5));
    (now === orig ? kept : converted).push({ id: node.id, name: node.name, fromLevel: node.level, toLevel });
    for (const c of node.children) walk(c, deletedAbove);
  }
  walk(source, 0);

  // With nothing removed, does the subtree still not fit? Tells the UI whether
  // removal is needed and lets the server refuse destructive extras.
  const needsRemoval = shift > 0 && (deleteIds.size === 0 ? errors.length > 0 : checkMove(source, targetLevel, new Set()).errors.length > 0);
  if (deleteIds.size > 0 && !needsRemoval) errors.push("Nothing needs to be removed for this move.");
  if (deleteIds.size > 0) {
    const ids = new Set(flatten(source).map((n) => n.id));
    for (const id of deleteIds) if (!ids.has(id)) errors.push("Can only remove items that are part of the moved item.");
  }

  if (fillLevels.length > 0) {
    if (fillNames.length !== fillLevels.length || fillNames.some((n) => !n || !n.trim())) {
      errors.push("Name the new level(s) that will hold the tasks.");
    } else if (fillNames.some((n) => n.trim().length > NAME_MAX)) {
      errors.push(`Names can be at most ${NAME_MAX} characters.`);
    }
  } else if (fillNames.length > 0) {
    errors.push("No new levels are needed for this move.");
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)], newRootLevel, shift, needsRemoval, fillLevels, fillBranches, converted, kept, deleted };
}

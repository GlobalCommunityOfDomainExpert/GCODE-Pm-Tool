import type { HierarchyLevel } from "@/lib/types";

// Pure move rules - no DB, no React - so the exact same function validates the
// live "which levels do I remove" modal in the browser and the real write on
// the server. If they ever disagreed, the server (which re-runs this) wins.

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
  // True when, with nothing deleted, the subtree would not fit L1-L5.
  needsRemoval: boolean;
  // Surviving nodes whose level changes (they get a new row in another table).
  converted: PlacedNode[];
  // Nodes whose level is unchanged (only their parent changes).
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

// source: the item being moved with its full subtree.
// targetLevel: level number (1-4) of the chosen new parent.
// deleteIds: nodes of the subtree the person chose to remove (their children
// move up to the removed node's parent).
//
// Rules, per branch:
//  - a Task must end up at exactly L5 (directly under a Project), and is never removable
//  - every container must end up at L4 or higher
//  - so each root-to-Task path must lose exactly `shift` nodes
export function checkMove(source: MoveNode, targetLevel: number, deleteIds: ReadonlySet<string>): MoveCheck {
  const errors: string[] = [];
  const srcNo = levelNo(source.level);
  const newRootLevel = targetLevel + 1;
  const shift = newRootLevel - srcNo;

  const converted: PlacedNode[] = [];
  const kept: PlacedNode[] = [];
  const deleted: MoveCheck["deleted"] = [];
  const reported = new Set<string>();

  function walk(node: MoveNode, deletedAbove: number) {
    const orig = levelNo(node.level);
    if (deleteIds.has(node.id)) {
      if (node.level === "task") {
        errors.push("Tasks can't be removed - they are always kept.");
      } else {
        deleted.push({ id: node.id, name: node.name, level: node.level });
      }
      for (const c of node.children) walk(c, deletedAbove + 1);
      return;
    }

    const now = orig + shift - deletedAbove;
    if (node.level === "task") {
      if (now !== 5 && !reported.has("task")) {
        reported.add("task");
        errors.push(
          now > 5
            ? "Some tasks would fall below level 5 - remove more levels on those branches."
            : shift < 0
            ? "This item contains tasks, so it can't move up to a higher level."
            : "Some tasks would end up above level 5 - remove fewer levels on those branches."
        );
      }
      (now === orig ? kept : converted).push({ id: node.id, name: node.name, fromLevel: node.level, toLevel: levelAt(Math.min(Math.max(now, 1), 5)) });
    } else {
      if (now > 4 && !reported.has(node.id)) {
        reported.add(node.id);
        errors.push(`"${node.name}" would end up at level ${now} - remove a level above it.`);
      }
      const toLevel = levelAt(Math.min(Math.max(now, 1), 5));
      (now === orig ? kept : converted).push({ id: node.id, name: node.name, fromLevel: node.level, toLevel });
    }
    for (const c of node.children) walk(c, deletedAbove);
  }
  walk(source, 0);

  // Baseline with nothing removed: tells the UI whether any removal is needed
  // and lets the server refuse destructive extras that fix nothing.
  const baselineErrors = deleteIds.size === 0 ? errors : checkMoveBaseline(source, targetLevel);
  const needsRemoval = baselineErrors.length > 0;
  if (deleteIds.size > 0 && !needsRemoval) {
    errors.push("Nothing needs to be removed for this move.");
  }
  if (deleteIds.size > 0) {
    const ids = new Set(flatten(source).map((n) => n.id));
    for (const id of deleteIds) {
      if (!ids.has(id)) errors.push("Can only remove items that are part of the moved item.");
    }
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)], newRootLevel, shift, needsRemoval, converted, kept, deleted };
}

function checkMoveBaseline(source: MoveNode, targetLevel: number): string[] {
  return checkMove(source, targetLevel, new Set()).errors;
}

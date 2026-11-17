import { NAME_MAX, DESCRIPTION_MAX } from "@/lib/limits";
import { CONTAINER_STATUSES, TASK_PRIORITIES, TASK_STATUSES, type HierarchyLevel } from "@/lib/types";
import { LEVELS, LEVEL_NAMES, LEVEL_NO, PATH_SEP, type ImportRow, type RowIssue } from "./schema";

// Pure: no DB, no Excel. Takes the parsed rows + a snapshot of the org and
// returns either a list of problems or an exact create/update plan. Import
// only writes when there are zero problems (all-or-nothing), and never deletes.

export interface ExistingNode {
  id: string;
  level: HierarchyLevel;
  parentId: string | null;
  name: string;
  description: string | null;
  status: string | null;
  ownerId: string | null;
  priority?: string; // task
  startDate?: string | null; // yyyy-mm-dd
  dueDate?: string | null;
}

export interface OrgUser {
  id: string;
  email: string;
}

export interface Anchor {
  level: HierarchyLevel;
  id: string;
}

export interface PlannedNode {
  rowNo: number;
  level: HierarchyLevel;
  existingId: string | null; // null = create
  parentKey: string | null; // key of parent entry: existing id, or "new:<rowNo>"
  key: string;
  name: string;
  description: string | null;
  status: string | null;
  ownerId: string | null;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  changed: boolean; // false = existing row identical to the sheet
}

export type Counts = Record<HierarchyLevel, { create: number; update: number; unchanged: number }>;

export interface Plan {
  nodes: PlannedNode[]; // parents before children
  counts: Counts;
}

export type PlanResult = { ok: true; plan: Plan; warnings: RowIssue[] } | { ok: false; errors: RowIssue[]; warnings: RowIssue[] };

interface Entry {
  key: string;
  level: HierarchyLevel;
  existingId: string | null;
  name: string;
  displayPath: string;
  lookup: string;
  anchor: Anchor | null; // nearest existing ancestor-or-self (for owner scope checks)
}

const norm = (s: string) => s.trim().toLowerCase();
const chars = (s: string) => [...s].length;

export function isValidDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function planImport(args: {
  rows: ImportRow[];
  existing: ExistingNode[];
  users: OrgUser[];
  // Mirrors assertAssigneeAllowed: may this user be assigned under `anchor`
  // (null = a brand-new workspace, so org-wide users only)?
  canAssign: (userId: string, anchor: Anchor | null) => boolean;
}): PlanResult {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const err = (row: number, column: string, message: string) => errors.push({ row, column, message });

  const byId = new Map(args.existing.map((n) => [n.id, n]));
  const userByEmail = new Map(args.users.map((u) => [norm(u.email), u]));

  // ---- per-row shape checks -------------------------------------------------
  const rows: (ImportRow & { lv: HierarchyLevel })[] = [];
  const seenIds = new Map<string, number>();
  for (const r of args.rows) {
    const lv = LEVELS.find((l) => norm(LEVEL_NAMES[l]) === norm(r.level));
    if (!lv) {
      err(r.rowNo, "Level", `"${r.level}" is not a level. Use Workspace, Initiative, Program, Project or Task.`);
      continue;
    }
    const before = errors.length;
    const e = (col: string, msg: string) => err(r.rowNo, col, msg);
    const name = r.name.trim();
    if (!name) e("Name", "Name is required.");
    if (chars(name) > NAME_MAX) e("Name", `Name can be at most ${NAME_MAX} characters.`);
    if (name.includes(PATH_SEP)) e("Name", `Name can't contain "${PATH_SEP}" (it separates the Parent Path).`);
    if (chars(r.description) > DESCRIPTION_MAX) e("Description", `Description can be at most ${DESCRIPTION_MAX} characters.`);
    if (lv === "workspace" && r.parentPath.trim()) e("Parent Path", "A Workspace has no parent - leave Parent Path blank.");
    if (lv !== "workspace" && !r.parentPath.trim()) e("Parent Path", `A ${LEVEL_NAMES[lv]} needs a Parent Path.`);
    if (r.id) {
      const ex = byId.get(r.id);
      if (!ex) e("ID", "This ID isn't in your organization. Clear it to create a new item, or re-export the file.");
      else if (ex.level !== lv) e("Level", `This ID belongs to a ${LEVEL_NAMES[ex.level]}; Level can't be changed here. Use "Move to…" in the app.`);
      if (seenIds.has(r.id)) e("ID", `Same ID as row ${seenIds.get(r.id)}.`);
      seenIds.set(r.id, r.rowNo);
    }
    if (lv === "task") {
      if (r.status && !(TASK_STATUSES as readonly string[]).includes(r.status)) e("Status", `Task status must be one of: ${TASK_STATUSES.join(", ")}.`);
      if (r.priority && !(TASK_PRIORITIES as readonly string[]).includes(r.priority)) e("Priority", `Priority must be one of: ${TASK_PRIORITIES.join(", ")}.`);
      if (r.startDate && !isValidDate(r.startDate)) e("Start Date", "Use a real date or yyyy-mm-dd.");
      if (r.dueDate && !isValidDate(r.dueDate)) e("Due Date", "Use a real date or yyyy-mm-dd.");
      if (r.startDate && r.dueDate && isValidDate(r.startDate) && isValidDate(r.dueDate) && r.dueDate < r.startDate) e("Due Date", "Due Date is before Start Date.");
    } else {
      if (r.priority) e("Priority", "Priority only applies to Tasks.");
      if (r.startDate) e("Start Date", "Start Date only applies to Tasks.");
      if (r.dueDate) e("Due Date", "Due Date only applies to Tasks.");
      if (r.status) {
        if (lv === "project") {
          if (!(CONTAINER_STATUSES as readonly string[]).includes(r.status)) e("Status", `Project status must be one of: ${CONTAINER_STATUSES.join(", ")}.`);
        } else if (!r.id || byId.get(r.id)?.status !== r.status) {
          e("Status", `Status only applies to Projects and Tasks (not ${LEVEL_NAMES[lv]}s).`);
        }
      }
    }
    if (r.owner && !userByEmail.has(norm(r.owner))) e("Owner Email", `No active teammate with email "${r.owner}".`);
    if (errors.length === before) rows.push({ ...r, lv });
  }
  if (errors.length > 0) return { ok: false, errors, warnings };

  // ---- resolve the hierarchy one level at a time ------------------------------
  // `index` maps lowercased final path -> entry. DB nodes not mentioned in the
  // sheet stay in the tree (nothing is deleted), so new rows can hang off them.
  const index = new Map<string, Entry>();
  const entryByExistingId = new Map<string, Entry>();
  const childrenOf = new Map<string | null, ExistingNode[]>();
  for (const n of args.existing) {
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }

  const planned: PlannedNode[] = [];
  const claimed = new Set<string>();

  for (const lv of LEVELS) {
    const levelRows = rows.filter((r) => r.lv === lv);
    const parentLevel = lv === "workspace" ? null : LEVELS[LEVEL_NO[lv] - 2];

    // 1) parent entry of every row
    const parentOf = new Map<number, Entry | null>();
    const usable: typeof levelRows = [];
    for (const r of levelRows) {
      if (!parentLevel) {
        parentOf.set(r.rowNo, null);
        usable.push(r);
        continue;
      }
      const p = index.get(norm(r.parentPath));
      if (!p || p.level !== parentLevel) {
        const why = p
          ? `that path is a ${LEVEL_NAMES[p.level]}, but a ${LEVEL_NAMES[lv]} must sit under a ${LEVEL_NAMES[parentLevel]}`
          : `no ${LEVEL_NAMES[parentLevel]} found at "${r.parentPath}"`;
        err(r.rowNo, "Parent Path", `${why}. Add the parent as its own row, or fix the path.`);
        continue;
      }
      if (r.id && byId.get(r.id)!.parentId !== p.existingId) {
        err(r.rowNo, "Parent Path", `This ${LEVEL_NAMES[lv]} lives under a different parent. Moving isn't done through Excel - use "Move to…" in the app.`);
        continue;
      }
      parentOf.set(r.rowNo, p);
      usable.push(r);
    }

    // 2) which existing node each row updates: by ID, else by parent + name
    const matched = new Map<number, ExistingNode | null>();
    for (const r of usable) if (r.id) claimed.add(r.id);
    for (const r of usable) {
      if (r.id) {
        matched.set(r.rowNo, byId.get(r.id)!);
        continue;
      }
      const parent = parentOf.get(r.rowNo) ?? null;
      const candidates = parent && !parent.existingId ? [] : (childrenOf.get(parent ? parent.existingId : null) ?? []);
      const hits = candidates.filter((n) => n.level === lv && !claimed.has(n.id) && norm(n.name) === norm(r.name));
      if (hits.length > 1) {
        err(r.rowNo, "Name", `${hits.length} existing ${LEVEL_NAMES[lv]}s are named "${r.name.trim()}" here, so it's unclear which to update. Use the exported ID.`);
        matched.set(r.rowNo, null);
      } else if (hits.length === 1) {
        claimed.add(hits[0].id);
        matched.set(r.rowNo, hits[0]);
      } else matched.set(r.rowNo, null);
    }

    // 3) entries for this level: sheet rows (new names) + untouched DB nodes
    const make = (key: string, existingId: string | null, parent: Entry | null, name: string): Entry => {
      const displayPath = parent ? `${parent.displayPath}${PATH_SEP}${name}` : name;
      // Tasks have no scope kind of their own - a task is judged by its project.
      const anchor: Anchor | null = existingId && lv !== "task" ? { level: lv, id: existingId } : parent ? parent.anchor : null;
      return { key, level: lv, existingId, name, displayPath, lookup: norm(displayPath), anchor };
    };
    const rowEntry = new Map<number, Entry>();
    const rowNoOfKey = new Map<string, number>();
    const entries: Entry[] = [];
    for (const r of usable) {
      const m = matched.get(r.rowNo) ?? null;
      const e = make(m ? m.id : `new:${r.rowNo}`, m ? m.id : null, parentOf.get(r.rowNo) ?? null, r.name.trim());
      rowEntry.set(r.rowNo, e);
      rowNoOfKey.set(e.key, r.rowNo);
      entries.push(e);
    }
    for (const n of args.existing) {
      if (n.level !== lv || claimed.has(n.id)) continue;
      const parent = n.parentId ? (entryByExistingId.get(n.parentId) ?? null) : null;
      if (parentLevel && !parent) continue;
      entries.push(make(n.id, n.id, parent, n.name));
    }

    // 4) two nodes ending up at the same path (pre-existing duplicates excepted)
    const seen = new Map<string, Entry>();
    for (const e of entries) {
      const prev = seen.get(e.lookup);
      if (!prev) {
        seen.set(e.lookup, e);
        continue;
      }
      // Two existing nodes that already shared this path before the import
      // (e.g. same-titled tasks) are fine as long as neither was renamed into it.
      const renamedInto = (x: Entry) => !!x.existingId && norm(byId.get(x.existingId)!.name) !== norm(x.name);
      if (prev.existingId && e.existingId && !renamedInto(prev) && !renamedInto(e)) continue;
      const rowNo = rowNoOfKey.get(e.key) ?? rowNoOfKey.get(prev.key);
      if (rowNo !== undefined) {
        const other = rowNoOfKey.has(prev.key) && rowNoOfKey.has(e.key) ? "another row in this file" : "an existing item";
        err(rowNo, "Name", `"${e.displayPath}" would duplicate ${other} at the same place.`);
      }
    }
    for (const e of entries) {
      if (!index.has(e.lookup)) index.set(e.lookup, e);
      if (e.existingId) entryByExistingId.set(e.existingId, e);
    }

    // 5) planned nodes
    for (const r of usable) {
      const e = rowEntry.get(r.rowNo)!;
      const m = matched.get(r.rowNo) ?? null;
      const parent = parentOf.get(r.rowNo) ?? null;

      let ownerId: string | null = null;
      if (r.owner) {
        const u = userByEmail.get(norm(r.owner))!;
        if (args.canAssign(u.id, e.anchor)) ownerId = u.id;
        else err(r.rowNo, "Owner Email", `${r.owner} doesn't have scope to be assigned here.`);
      }

      const description = r.description.trim() || null;
      const status = lv === "task" ? r.status || m?.status || "Not Started" : lv === "project" ? r.status || m?.status || "On Track" : (m?.status ?? null);
      const priority = lv === "task" ? r.priority || m?.priority || "Medium" : null;
      const startDate = lv === "task" ? r.startDate || null : null;
      const dueDate = lv === "task" ? r.dueDate || null : null;
      const name = r.name.trim();

      const changed =
        !m ||
        m.name !== name ||
        (m.description ?? null) !== description ||
        (m.status ?? null) !== status ||
        (m.ownerId ?? null) !== ownerId ||
        (lv === "task" && ((m.priority ?? null) !== priority || (m.startDate ?? null) !== startDate || (m.dueDate ?? null) !== dueDate));

      planned.push({ rowNo: r.rowNo, level: lv, existingId: m ? m.id : null, parentKey: parent ? parent.key : null, key: e.key, name, description, status, ownerId, priority, startDate, dueDate, changed });
    }
  }

  if (errors.length > 0) return { ok: false, errors, warnings };

  const counts = Object.fromEntries(LEVELS.map((l) => [l, { create: 0, update: 0, unchanged: 0 }])) as Counts;
  for (const p of planned) {
    if (!p.existingId) counts[p.level].create++;
    else if (p.changed) counts[p.level].update++;
    else counts[p.level].unchanged++;
  }
  if (planned.length === 0) warnings.push({ row: 0, message: "The sheet has no data rows." });
  return { ok: true, plan: { nodes: planned, counts }, warnings };
}

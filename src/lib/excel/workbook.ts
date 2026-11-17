import ExcelJS from "exceljs";
import { CONTAINER_STATUSES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/types";
import {
  COLUMNS,
  LEVELS,
  LEVEL_NAMES,
  MAX_ROWS,
  PATH_SEP,
  SHEET_HIERARCHY,
  SHEET_INSTRUCTIONS,
  SHEET_LISTS,
  SHEET_META,
  TEMPLATE_VERSION,
  type ColumnKey,
  type ImportRow,
  type RowIssue,
} from "./schema";
import type { ExistingNode } from "./plan";

const HEADER_FILL = "FF1E3A5F";
const SYSTEM_FILL = "FFF1F5F9";

// ---- export -------------------------------------------------------------------

export interface ExportInput {
  organizationId: string;
  organizationName: string;
  nodes: ExistingNode[]; // whole org, any order
  emailOfUser: Map<string, string>;
  template?: boolean; // headers + one example, no data
}

export async function buildWorkbook(input: ExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gcode Workspaces";
  wb.created = new Date();

  const ws = wb.addWorksheet(SHEET_HIERARCHY, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle" };
    cell.note = COLUMNS[col - 1].note;
  });

  // Rows depth-first, so the sheet reads like the tree.
  const kids = new Map<string | null, ExistingNode[]>();
  for (const n of input.nodes) {
    const l = kids.get(n.parentId) ?? [];
    l.push(n);
    kids.set(n.parentId, l);
  }
  const rows: Record<ColumnKey, string | Date | null>[] = [];
  const walk = (parentId: string | null, path: string) => {
    for (const n of kids.get(parentId) ?? []) {
      rows.push({
        id: n.id,
        level: LEVEL_NAMES[n.level],
        parentPath: path,
        name: n.name,
        description: n.description,
        status: n.status,
        owner: n.ownerId ? (input.emailOfUser.get(n.ownerId) ?? null) : null,
        priority: n.level === "task" ? (n.priority ?? null) : null,
        startDate: n.startDate ? new Date(`${n.startDate}T00:00:00Z`) : null,
        dueDate: n.dueDate ? new Date(`${n.dueDate}T00:00:00Z`) : null,
      });
      walk(n.id, path ? `${path}${PATH_SEP}${n.name}` : n.name);
    }
  };
  if (input.template) {
    rows.push({ id: null, level: "Workspace", parentPath: "", name: "Example Client", description: "Delete this example row", status: null, owner: null, priority: null, startDate: null, dueDate: null });
    rows.push({ id: null, level: "Initiative", parentPath: "Example Client", name: "Example Initiative", description: null, status: null, owner: null, priority: null, startDate: null, dueDate: null });
  } else walk(null, "");
  for (const r of rows) ws.addRow(r);

  const lastRow = Math.max(rows.length + 1, 2) + 500; // validation also covers rows the admin adds below
  const idCol = COLUMNS.findIndex((c) => c.key === "id") + 1;
  for (let i = 2; i <= rows.length + 1; i++) {
    const c = ws.getRow(i).getCell(idCol);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SYSTEM_FILL } };
    c.font = { color: { argb: "FF94A3B8" }, size: 9 };
  }
  for (const key of ["startDate", "dueDate"] as const) ws.getColumn(key).numFmt = "yyyy-mm-dd";
  ws.getColumn("name").alignment = { wrapText: true, vertical: "top" };

  // Dropdown source lists live on a hidden sheet.
  const lists = wb.addWorksheet(SHEET_LISTS, { state: "veryHidden" });
  const listCols: [string, readonly string[]][] = [
    ["A", LEVELS.map((l) => LEVEL_NAMES[l])],
    ["B", [...new Set([...CONTAINER_STATUSES, ...TASK_STATUSES])]],
    ["C", TASK_PRIORITIES],
  ];
  for (const [col, vals] of listCols) vals.forEach((v, i) => (lists.getCell(`${col}${i + 1}`).value = v));
  const rangeOf = (col: string, n: number) => `${SHEET_LISTS}!$${col}$1:$${col}$${n}`;
  const colLetter = (key: ColumnKey) => ws.getColumn(key).letter;
  const dropdowns: [ColumnKey, string][] = [
    ["level", rangeOf("A", listCols[0][1].length)],
    ["status", rangeOf("B", listCols[1][1].length)],
    ["priority", rangeOf("C", listCols[2][1].length)],
  ];
  for (const [key, range] of dropdowns) {
    const L = colLetter(key);
    for (let i = 2; i <= lastRow; i++) {
      ws.getCell(`${L}${i}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [range],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Not allowed",
        error: `Pick a value from the list.`,
      };
    }
  }
  for (const key of ["startDate", "dueDate"] as const) {
    const L = colLetter(key);
    for (let i = 2; i <= lastRow; i++) {
      ws.getCell(`${L}${i}`).dataValidation = {
        type: "date",
        operator: "greaterThan",
        allowBlank: true,
        formulae: [new Date(Date.UTC(1990, 0, 1))],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Not a date",
        error: "Enter a date (yyyy-mm-dd).",
      };
    }
  }
  const nameL = colLetter("name");
  const descL = colLetter("description");
  for (let i = 2; i <= lastRow; i++) {
    ws.getCell(`${nameL}${i}`).dataValidation = { type: "textLength", operator: "lessThanOrEqual", allowBlank: true, formulae: [60], showErrorMessage: true, errorStyle: "stop", errorTitle: "Too long", error: "Max 60 characters." };
    ws.getCell(`${descL}${i}`).dataValidation = { type: "textLength", operator: "lessThanOrEqual", allowBlank: true, formulae: [255], showErrorMessage: true, errorStyle: "stop", errorTitle: "Too long", error: "Max 255 characters." };
  }

  // Instructions
  const ins = wb.addWorksheet(SHEET_INSTRUCTIONS, { properties: { tabColor: { argb: "FF2563EB" } } });
  ins.getColumn(1).width = 22;
  ins.getColumn(2).width = 110;
  const lines: [string, string][] = [
    ["Gcode hierarchy sheet", `Organization: ${input.organizationName}. Admin-only import/export of Workspaces > Initiatives > Programs > Projects > Tasks.`],
    ["", ""],
    ["How it works", `One row per item on the "${SHEET_HIERARCHY}" sheet. Parents come before children. Import is ADDITIVE: it creates new items and updates matched ones, and never deletes anything.`],
    ["Updating", "Keep the ID (system) value. Edit Name, Description, Status, Owner, Priority, dates freely - a renamed parent keeps its children (children reference the NEW name in Parent Path)."],
    ["Adding", `Leave ID blank. Set Level, and Parent Path = ancestor names joined with "${PATH_SEP.trim()}", e.g. Acme${PATH_SEP}Q1 Launch${PATH_SEP}Website. The parent may be an existing item or a row in this same file.`],
    ["Matching", "A blank-ID row whose Level + Parent Path + Name matches an existing item updates that item instead of creating a duplicate."],
    ["Moving", 'Not done here. A changed Parent Path on an exported row is rejected - use "Move to…" in the app.'],
    ["Blank cells", "Description and Owner: blank clears. Task Status/Priority: blank keeps the current value (new task: Not Started / Medium). Dates: blank clears."],
    ["Safety", "The whole file is checked first (Preview). If any row has a problem, NOTHING is imported. Files from another organization or template version are refused."],
    ["Limits", `Max ${MAX_ROWS} rows, 5 MB. Name max 60 chars, Description max 255. Names can't contain "${PATH_SEP}".`],
    ["", ""],
    ["Column", "Rule"],
    ...COLUMNS.map((c): [string, string] => [c.header, c.note]),
  ];
  lines.forEach(([a, b], i) => {
    ins.getCell(i + 1, 1).value = a;
    ins.getCell(i + 1, 2).value = b;
    ins.getCell(i + 1, 1).font = { bold: true };
    ins.getCell(i + 1, 2).alignment = { wrapText: true, vertical: "top" };
  });
  ins.getCell(1, 1).font = { bold: true, size: 14 };

  const meta = wb.addWorksheet(SHEET_META, { state: "veryHidden" });
  meta.getCell("A1").value = "org";
  meta.getCell("B1").value = input.organizationId;
  meta.getCell("A2").value = "version";
  meta.getCell("B2").value = TEMPLATE_VERSION;

  wb.worksheets.sort((a, b) => order(a.name) - order(b.name));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function order(name: string): number {
  return [SHEET_HIERARCHY, SHEET_INSTRUCTIONS, SHEET_LISTS, SHEET_META].indexOf(name);
}

// ---- import (parse only; validation lives in plan.ts) ---------------------------

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("error" in o) return "#ERROR";
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    if ("result" in o) return cellText(o.result as ExcelJS.CellValue);
    if ("text" in o) return String(o.text).trim(); // hyperlink
  }
  return String(v).trim();
}

export type ParseResult = { ok: true; orgId: string; rows: ImportRow[] } | { ok: false; errors: RowIssue[] };

export async function parseWorkbook(buf: Buffer): Promise<ParseResult> {
  const fail = (message: string): ParseResult => ({ ok: false, errors: [{ row: 0, message }] });
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  } catch {
    return fail("That isn't a valid .xlsx file.");
  }

  const meta = wb.getWorksheet(SHEET_META);
  const ws = wb.getWorksheet(SHEET_HIERARCHY);
  if (!meta || !ws) return fail(`This isn't a Gcode hierarchy file (missing the "${SHEET_HIERARCHY}" sheet). Export or download the template from the app and edit that.`);
  const orgId = cellText(meta.getCell("B1").value);
  if (Number(cellText(meta.getCell("B2").value)) !== TEMPLATE_VERSION) return fail("This file is from a different template version. Export a fresh file and re-apply your edits.");

  // Header row must match exactly - guards against reordered/deleted columns.
  for (let i = 0; i < COLUMNS.length; i++) {
    if (cellText(ws.getRow(1).getCell(i + 1).value) !== COLUMNS[i].header) {
      return fail(`Column ${i + 1} must be "${COLUMNS[i].header}". Don't rename, move or delete columns.`);
    }
  }

  const rows: ImportRow[] = [];
  const last = ws.actualRowCount > 0 ? ws.rowCount : 1;
  for (let r = 2; r <= last; r++) {
    const row = ws.getRow(r);
    const get = (k: ColumnKey) => cellText(row.getCell(COLUMNS.findIndex((c) => c.key === k) + 1).value);
    const item: ImportRow = {
      rowNo: r,
      id: get("id"),
      level: get("level"),
      parentPath: get("parentPath"),
      name: get("name"),
      description: get("description"),
      status: get("status"),
      owner: get("owner"),
      priority: get("priority"),
      startDate: get("startDate"),
      dueDate: get("dueDate"),
    };
    const blank = Object.entries(item).every(([k, v]) => k === "rowNo" || v === "");
    if (blank) continue;
    if (Object.values(item).some((v) => v === "#ERROR")) return fail(`Row ${r} contains an Excel error value (#REF!, #N/A…). Fix it and re-upload.`);
    rows.push(item);
    if (rows.length > MAX_ROWS) return fail(`Too many rows (max ${MAX_ROWS}). Split the file.`);
  }
  return { ok: true, orgId, rows };
}

// Pure checks for the Excel import planner + workbook round-trip (no DB, no server):
//   npx tsx scripts/test-excel-plan.ts
import { planImport, type ExistingNode } from "../src/lib/excel/plan";
import { buildWorkbook, parseWorkbook } from "../src/lib/excel/workbook";
import type { ImportRow } from "../src/lib/excel/schema";

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
  if (!ok) failed++;
};

const ex = (id: string, level: ExistingNode["level"], parentId: string | null, name: string, more: Partial<ExistingNode> = {}): ExistingNode => ({
  id, level, parentId, name, description: null, status: null, ownerId: null, ...more,
});
const existing: ExistingNode[] = [
  ex("w1", "workspace", null, "Acme"),
  ex("i1", "initiative", "w1", "Q1"),
  ex("g1", "program", "i1", "Web"),
  ex("p1", "project", "g1", "Site", { status: "On Track" }),
  ex("t1", "task", "p1", "Design", { status: "Not Started", priority: "Medium" }),
];
const users = [{ id: "u1", email: "a@x.com" }, { id: "u2", email: "scoped@x.com" }];
const canAssign = (id: string, anchor: { id: string } | null) => id === "u1" || (!!anchor && anchor.id === "p1");

let n = 1;
const row = (o: Partial<ImportRow>): ImportRow => ({
  rowNo: ++n, id: "", level: "", parentPath: "", name: "", description: "", status: "", owner: "", priority: "", startDate: "", dueDate: "", ...o,
});
const run = (rows: ImportRow[]) => planImport({ rows, existing, users, canAssign });
const errs = (r: ReturnType<typeof run>) => (r.ok ? [] : r.errors.map((e) => `${e.column}:${e.message}`));

async function main() {
  let r = run([row({ level: "Project", parentPath: "Acme > Q1 > Web", name: "App" })]);
  check("add project under existing program", r.ok && r.plan.counts.project.create === 1, JSON.stringify(errs(r)));

  r = run([
    row({ level: "Workspace", name: "Beta" }),
    row({ level: "Initiative", parentPath: "Beta", name: "I" }),
    row({ level: "Task", parentPath: "Beta > I", name: "bad parent level" }),
  ]);
  check("task directly under initiative rejected", !r.ok && errs(r).some((e) => e.startsWith("Parent Path")));

  r = run([
    row({ level: "Workspace", name: "Beta" }),
    row({ level: "Initiative", parentPath: "Beta", name: "I" }),
    row({ level: "Program", parentPath: "Beta > I", name: "P" }),
    row({ level: "Project", parentPath: "Beta > I > P", name: "Pr" }),
    row({ level: "Task", parentPath: "Beta > I > P > Pr", name: "T" }),
  ]);
  check("full new chain in one file", r.ok && Object.values(r.plan.counts).every((c) => c.create === 1), JSON.stringify(errs(r)));

  r = run([row({ level: "Task", parentPath: "Acme > Q1 > Web > Site", name: "design", priority: "High" })]);
  check("blank-ID row matches existing task (update)", r.ok && r.plan.counts.task.update === 1 && r.plan.counts.task.create === 0, JSON.stringify(errs(r)));

  r = run([row({ id: "t1", level: "Task", parentPath: "Acme > Q1 > Web > Site", name: "Design" })]);
  check("identical row counts as unchanged", r.ok && r.plan.counts.task.unchanged === 1, JSON.stringify(errs(r)));

  r = run([
    row({ id: "i1", level: "Initiative", parentPath: "Acme", name: "Q1 Renamed" }),
    row({ level: "Program", parentPath: "Acme > Q1 Renamed", name: "New Prog" }),
  ]);
  check("rename parent + child uses new name", r.ok && r.plan.counts.initiative.update === 1 && r.plan.counts.program.create === 1, JSON.stringify(errs(r)));
  r = run([
    row({ id: "i1", level: "Initiative", parentPath: "Acme", name: "Q1 Renamed" }),
    row({ level: "Program", parentPath: "Acme > Q1", name: "New Prog" }),
  ]);
  check("old name of renamed parent no longer resolves", !r.ok);

  r = run([row({ id: "g1", level: "Program", parentPath: "Acme", name: "Web" })]);
  check("parent change on ID row rejected", !r.ok);

  r = run([row({ id: "g1", level: "Project", parentPath: "Acme > Q1", name: "Web" })]);
  check("level change on ID rejected", !r.ok && errs(r).some((e) => e.startsWith("Level")));

  r = run([row({ id: "zzz", level: "Workspace", name: "X" })]);
  check("unknown ID rejected", !r.ok && errs(r).some((e) => e.startsWith("ID")));

  r = run([row({ level: "Workspace", name: "Dup" }), row({ level: "Workspace", name: "dup" })]);
  check("duplicate sibling names in file rejected", !r.ok);

  const ex2 = [...existing, ex("w2", "workspace", null, "Other")];
  const r2 = planImport({ rows: [row({ id: "w2", level: "Workspace", name: "Acme" })], existing: ex2, users, canAssign });
  check("rename onto existing sibling rejected", !r2.ok);

  check("long name rejected", !run([row({ level: "Workspace", name: "x".repeat(61) })]).ok);
  check("name with ' > ' rejected", !run([row({ level: "Workspace", name: "a > b" })]).ok);
  check("long description rejected", !run([row({ level: "Workspace", name: "A2", description: "x".repeat(256) })]).ok);
  check("status on program rejected", !run([row({ level: "Program", parentPath: "Acme > Q1", name: "P2", status: "On Track" })]).ok);
  check("bad project status rejected", !run([row({ level: "Project", parentPath: "Acme > Q1 > Web", name: "P3", status: "Nope" })]).ok);
  check("priority on project rejected", !run([row({ level: "Project", parentPath: "Acme > Q1 > Web", name: "P4", priority: "High" })]).ok);
  check("bad task status rejected", !run([row({ level: "Task", parentPath: "Acme > Q1 > Web > Site", name: "T2", status: "Done" })]).ok);
  check("impossible date rejected", !run([row({ level: "Task", parentPath: "Acme > Q1 > Web > Site", name: "T3", dueDate: "2026-02-31" })]).ok);
  check("due before start rejected", !run([row({ level: "Task", parentPath: "Acme > Q1 > Web > Site", name: "T4", startDate: "2026-03-02", dueDate: "2026-03-01" })]).ok);
  check("unknown level rejected", !run([row({ level: "Epic", name: "E" })]).ok);
  check("unknown owner rejected", !run([row({ level: "Workspace", name: "W9", owner: "nobody@x.com" })]).ok);
  check("owner without scope rejected", !run([row({ level: "Workspace", name: "W10", owner: "scoped@x.com" })]).ok);
  check("owner with scope under project ok", run([row({ level: "Task", parentPath: "Acme > Q1 > Web > Site", name: "T5", owner: "SCOPED@x.com" })]).ok);
  check("workspace with parent path rejected", !run([row({ level: "Workspace", parentPath: "x", name: "W11" })]).ok);
  check("missing parent rejected", !run([row({ level: "Program", parentPath: "Nope > Q1", name: "P" })]).ok);
  check("all errors reported, not just first", (() => { const x = run([row({ level: "Epic", name: "A" }), row({ level: "Workspace", name: "" })]); return !x.ok && x.errors.length >= 2; })());

  const buf = await buildWorkbook({ organizationId: "org1", organizationName: "Org", nodes: existing, emailOfUser: new Map() });
  const parsed = await parseWorkbook(buf);
  check("round-trip parses", parsed.ok && parsed.orgId === "org1" && parsed.rows.length === existing.length, JSON.stringify(parsed.ok ? "" : parsed.errors));
  if (parsed.ok) {
    const rt = planImport({ rows: parsed.rows, existing, users, canAssign });
    const total = rt.ok ? Object.values(rt.plan.counts).reduce((a, c) => a + c.unchanged, 0) : -1;
    check("export then import = zero changes", rt.ok && total === existing.length, JSON.stringify(rt.ok ? rt.plan.counts : rt.errors));
    check("export order is tree order", parsed.rows.map((x) => x.name).join(",") === "Acme,Q1,Web,Site,Design");
  }
  const tpl = await parseWorkbook(await buildWorkbook({ organizationId: "org1", organizationName: "Org", nodes: [], emailOfUser: new Map(), template: true }));
  check("template parses with example rows", tpl.ok && tpl.rows.length === 2);
  const bad = await parseWorkbook(Buffer.from("not an xlsx"));
  check("garbage file rejected cleanly", !bad.ok);

  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
main();

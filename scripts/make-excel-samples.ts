// Builds sample import files from a LIVE export of the demo DB, for eyeballing
// the import UI. Demo DB only. Usage:
//   DATABASE_URL=...gcode_demo npx tsx scripts/make-excel-samples.ts <outDir>
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import ExcelJS from "exceljs";
import { mkdirSync } from "fs";
import { join } from "path";

const DEMO_URL = "postgresql://postgres:e2e@127.0.0.1:15432/gcode_demo";
if (process.env.DATABASE_URL !== DEMO_URL) {
  console.error(`Refusing to run: DATABASE_URL must be ${DEMO_URL}`);
  process.exit(1);
}
const BASE = process.env.BASE_URL || "http://localhost:3001";
const out = process.argv[2];
if (!out) throw new Error("outDir required");
mkdirSync(out, { recursive: true });
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.test" } });
  const sid = randomBytes(16).toString("hex");
  await prisma.session.create({ data: { id: sid, userId: admin.id, expiresAt: new Date(Date.now() + 8 * 3600_000) } });
  console.log("SESSION", sid);

  const res = await fetch(`${BASE}/api/hierarchy/excel`, { headers: { cookie: `gcode_session=${sid}` } });
  if (!res.ok) throw new Error(`export failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const edit = async (file: string, fn: (ws: ExcelJS.Worksheet) => void) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    fn(wb.getWorksheet("Hierarchy")!);
    await wb.xlsx.writeFile(join(out, file));
  };
  const lastRow = async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const ws = wb.getWorksheet("Hierarchy")!;
    let last = 1;
    ws.eachRow((row, i) => { if (row.getCell(2).value) last = i; }); // last row with a Level
    return last;
  };
  const n = await lastRow();
  const add = (ws: ExcelJS.Worksheet, i: number, v: (string | null)[]) => ws.getRow(n + i).values = v;
  // cols: id, level, parentPath, name, description, status, owner, priority, start, due

  await edit("1-export-unchanged.xlsx", () => {});
  await edit("2-good-adds.xlsx", (ws) => {
    add(ws, 1, [null, "Workspace", "", "Globex Corp", "New client via Excel", null, null, null, null, null]);
    add(ws, 2, [null, "Initiative", "Globex Corp", "Onboarding", null, null, null, null, null, null]);
  });
  await edit("3-bad-rows.xlsx", (ws) => {
    add(ws, 1, [null, "Epic", "", "Bad level", null, null, null, null, null, null]);
    add(ws, 2, [null, "Task", "Nope > Nothing", "Orphan task", null, "Done", null, "Urgent", "2026-02-31", null]);
    add(ws, 3, [null, "Workspace", "", "X".repeat(70), null, null, null, null, null, null]);
    add(ws, 4, [null, "Workspace", "", "Dupe", null, null, null, null, null, null]);
    add(ws, 5, [null, "Workspace", "", "dupe", null, null, null, null, null, null]);
    add(ws, 6, [null, "Workspace", "", "Owner test", null, null, "ghost@nowhere.test", null, null, null]);
  });
  console.log("files in", out);
}
main().finally(() => prisma.$disconnect());

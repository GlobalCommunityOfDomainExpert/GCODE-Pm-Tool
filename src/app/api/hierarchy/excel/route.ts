import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { withSession, ApiError } from "@/lib/auth/requireCapability";
import { isOrgAdmin } from "@/lib/auth/access";
import { getOrgName } from "@/lib/auth/org";
import { buildWorkbook, parseWorkbook } from "@/lib/excel/workbook";
import { planImport } from "@/lib/excel/plan";
import { applyPlan, loadAssignment, loadOrgNodes } from "@/lib/excel/db";
import { MAX_FILE_BYTES } from "@/lib/excel/schema";

// Excel import/export touches every level at once, so it's org-wide Admin only
// (same gate as "Move to…"), checked server-side on every call.
function assertAdmin(user: Parameters<typeof isOrgAdmin>[0]) {
  if (!isOrgAdmin(user)) throw new ApiError(403, "Only an Admin can import or export the hierarchy.");
}

// GET            -> current hierarchy as .xlsx
// GET ?template=1 -> empty template with one example
export const GET = withSession(async (req: NextRequest, _ctx, user) => {
  assertAdmin(user);
  const nodes = await loadOrgNodes(user.organizationId);
  const { emailOfUser } = await loadAssignment(user.organizationId, nodes);
  const template = req.nextUrl.searchParams.get("template") === "1";
  const buf = await buildWorkbook({
    organizationId: user.organizationId,
    organizationName: await getOrgName(user.organizationId),
    nodes,
    emailOfUser,
    template,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="gcode-hierarchy-${template ? "template" : stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});

// POST multipart (file) -> validate; with commit=1 also write. Same code path
// either way, so the preview is exactly what a commit would do.
export const POST = withSession(async (req: NextRequest, _ctx, user) => {
  assertAdmin(user);
  const commit = req.nextUrl.searchParams.get("commit") === "1";

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_FILE_BYTES + 64 * 1024) throw new ApiError(413, "File is too large (max 5 MB).");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Choose an .xlsx file.");
  if (file.size > MAX_FILE_BYTES) throw new ApiError(413, "File is too large (max 5 MB).");
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new ApiError(400, "Only .xlsx files are supported.");

  const parsed = await parseWorkbook(Buffer.from(await file.arrayBuffer()));
  if (!parsed.ok) return NextResponse.json({ ok: false, errors: parsed.errors, warnings: [] }, { status: 422 });
  if (parsed.orgId !== user.organizationId) {
    return NextResponse.json({ ok: false, errors: [{ row: 0, message: "This file was exported from a different organization." }], warnings: [] }, { status: 422 });
  }

  const nodes = await loadOrgNodes(user.organizationId);
  const { orgUsers, canAssign } = await loadAssignment(user.organizationId, nodes);
  const result = planImport({ rows: parsed.rows, existing: nodes, users: orgUsers, canAssign });
  if (!result.ok) return NextResponse.json({ ok: false, errors: result.errors.slice(0, 200), totalErrors: result.errors.length, warnings: result.warnings }, { status: 422 });

  if (!commit) return NextResponse.json({ ok: true, committed: false, counts: result.plan.counts, warnings: result.warnings });

  const applied = await applyPlan(user.organizationId, result.plan);
  revalidateTag(`tree:${user.organizationId}`);
  return NextResponse.json({ ok: true, committed: true, counts: result.plan.counts, applied, warnings: result.warnings });
});

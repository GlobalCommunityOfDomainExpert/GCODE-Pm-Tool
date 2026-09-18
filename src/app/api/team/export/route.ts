import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability } from "@/lib/auth/requireCapability";

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export const GET = withCapability("Manage Team Members", async (_req, _ctx, user) => {
  const users = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "asc" },
  });

  const rows = [["Name", "Email", "Role", "Scope", "Status"], ...users.map((u) => [u.name, u.email || "", u.roles.join("; "), u.scope || "Whole Org", u.status])];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="gcode-team.csv"',
    },
  });
});

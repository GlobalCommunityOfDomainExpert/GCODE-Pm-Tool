import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

// Multiple organizations are supported and fully isolated from each other -
// every Workspace/Person a new org creates is its own, and it never sees
// another org's data (see the organizationId filters throughout the rest of
// the API). The one exception is a one-time orphan claim below, for rows
// created before multi-tenancy existed at all.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const orgName = (body?.orgName || "").trim();
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  const password = body?.password || "";

  if (!orgName || !name || !email || !password) {
    return NextResponse.json({ error: "Fill in all fields to create your organization." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  const { user } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: orgName } });
    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        name,
        email,
        passwordHash,
        roles: ["Admin"],
        status: "active",
        source: "org-founder",
      },
    });

    // One-time adoption of pre-multi-tenancy legacy rows (organizationId
    // still null). Only ever matches anything the very first time an org
    // registers after this migration ships - every registration after that
    // finds zero orphans left and this is a no-op.
    await tx.workspace.updateMany({ where: { organizationId: null }, data: { organizationId: organization.id } });
    await tx.person.updateMany({ where: { organizationId: null }, data: { organizationId: organization.id } });

    return { organization, user };
  });

  await createSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, roles: user.roles }, { status: 201 });
}

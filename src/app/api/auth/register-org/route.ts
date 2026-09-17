import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTheOrganization } from "@/lib/auth/org";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const orgName = (body?.orgName || "").trim();
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  const password = body?.password || "";

  if (!orgName || !name || !email || !password) {
    return NextResponse.json({ error: "Fill in all fields to create your organization." }, { status: 400 });
  }

  const existing = await getTheOrganization();
  if (existing) {
    return NextResponse.json(
      { error: "An organization already exists on this deployment. Sign in instead, or ask your admin for an invite." },
      { status: 409 }
    );
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
    return { organization, user };
  });

  await createSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, roles: user.roles }, { status: 201 });
}

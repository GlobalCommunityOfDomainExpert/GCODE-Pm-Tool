import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

// Multiple organizations are supported and fully isolated from each other -
// every Workspace/Person a new org creates is its own, and it never sees
// another org's data (see the organizationId filters throughout the rest of
// the API). This route does NOT auto-adopt orphaned (organizationId: null)
// Workspace/Person rows, deliberately: an orphan could be legitimate
// pre-multi-tenancy legacy data, or it could be debris left behind by a
// deleted organization (Workspace/Person use onDelete: SetNull, not Cascade,
// specifically so deleting an org can never destroy real project data) -
// and there is no way to tell those two cases apart automatically. Handing
// either one to whichever unrelated org happens to register next would be
// exactly the cross-tenant leak this migration exists to prevent. The one
// legitimate legacy-data adoption (the real pre-existing GCODE workspace)
// was a one-time manual operation, not standing behavior - see the v0.3
// migration notes / commit history, not this route.
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
    return { organization, user };
  });

  await createSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, roles: user.roles }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";

const MAX_ATTEMPTS = 5;

// Step 2 of org registration: checks the code mailed by register-org/route.ts
// against the pending row, then creates the real Organization + User.
//
// Multiple organizations are supported and fully isolated from each other -
// every Workspace/Person a new org creates is its own, and it never sees
// another org's data. This route does NOT auto-adopt orphaned
// (organizationId: null) Workspace/Person rows, deliberately: an orphan could
// be legitimate pre-multi-tenancy legacy data, or debris left behind by a
// deleted organization (Workspace/Person use onDelete: SetNull, not Cascade,
// specifically so deleting an org can never destroy real project data) - and
// there is no way to tell those two cases apart automatically. Handing either
// one to whichever unrelated org happens to register next would be exactly
// the cross-tenant leak multi-tenancy exists to prevent.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = (body?.email || "").trim().toLowerCase();
  const otp = (body?.otp || "").trim();

  if (!email || !otp) {
    return NextResponse.json({ error: "Enter the code from your email." }, { status: 400 });
  }

  const pending = await prisma.pendingOrgRegistration.findUnique({ where: { email } });
  if (!pending) {
    return NextResponse.json({ error: "No pending registration for that email. Start over." }, { status: 404 });
  }
  if (pending.otpExpiresAt < new Date()) {
    return NextResponse.json({ error: "That code has expired. Request a new one." }, { status: 410 });
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many incorrect attempts. Request a new code." }, { status: 429 });
  }

  if (hashToken(otp) !== pending.otpHash) {
    await prisma.pendingOrgRegistration.update({ where: { email }, data: { attempts: { increment: 1 } } });
    const remaining = MAX_ATTEMPTS - pending.attempts - 1;
    return NextResponse.json(
      { error: remaining > 0 ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.` : "Incorrect code. Request a new one." },
      { status: 400 }
    );
  }

  const { user } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: pending.orgName } });
    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        name: pending.name,
        email: pending.email,
        passwordHash: pending.passwordHash,
        roles: ["Admin"],
        status: "active",
        source: "org-founder",
      },
    });
    await tx.pendingOrgRegistration.delete({ where: { email } });
    return { organization, user };
  });

  await createSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, roles: user.roles }, { status: 201 });
}

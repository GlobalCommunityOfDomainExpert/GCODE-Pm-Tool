import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCapability, ApiError } from "@/lib/auth/requireCapability";
import { randomToken, hashToken } from "@/lib/auth/tokens";
import { sendMail, magicLinkEmail } from "@/lib/mailer";

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

async function loadTargetOrThrow(organizationId: string, id: string) {
  const target = await prisma.user.findFirst({ where: { id, organizationId } });
  if (!target) throw new ApiError(404, "Team member not found.");
  return target;
}

// Every row action except delete: edit role/scope, resend/reset, deactivate/reactivate.
// None of them can ever target the caller's own row — checked here, server-side,
// not just a disabled button (FR-14).
export const PATCH = withCapability("Manage Team Members", async (req: NextRequest, { params }: { params: { id: string } }, admin) => {
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const target = await loadTargetOrThrow(admin.organizationId, params.id);

  if (action === "edit") {
    const roles: string[] = Array.isArray(body?.roles) && body.roles.length ? body.roles : ["Team Member"];
    const scope: string | null = body?.scope ?? null;
    const updated = await prisma.user.update({ where: { id: target.id }, data: { roles, scope } });
    return NextResponse.json({ id: updated.id, roles: updated.roles, scope: updated.scope });
  }

  if (params.id === admin.id) {
    throw new ApiError(400, "You can't perform that action on your own account.");
  }

  if (action === "resend" || action === "reset") {
    const isReset = action === "reset";
    if (isReset && target.status !== "active") throw new ApiError(400, "Reset Password only applies to an active user.");
    if (!isReset && target.status !== "invited") throw new ApiError(400, "Resend Link only applies to a pending invite.");

    const rawToken = randomToken();
    await prisma.user.update({
      where: { id: target.id },
      data: { status: "invited", inviteTokenHash: hashToken(rawToken), inviteTokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    });

    const org = await prisma.organization.findUnique({ where: { id: admin.organizationId } });
    const link = `${req.nextUrl.origin}/invite/${rawToken}`;
    const { subject, text, html } = magicLinkEmail({ orgName: org?.name || "your organization", recipientName: target.name, link, isReset });

    let sent = true;
    if (target.email) {
      try {
        await sendMail({ to: target.email, subject, text, html });
      } catch (err) {
        console.error("resend/reset send failed:", err);
        sent = false;
      }
    } else {
      sent = false;
    }
    return NextResponse.json({ emailSent: sent });
  }

  if (action === "suspend" || action === "activate") {
    const status = action === "suspend" ? "suspended" : "active";
    const updated = await prisma.user.update({ where: { id: target.id }, data: { status } });
    return NextResponse.json({ id: updated.id, status: updated.status });
  }

  throw new ApiError(400, "Unknown action.");
});

export const DELETE = withCapability("Manage Team Members", async (_req: NextRequest, { params }: { params: { id: string } }, admin) => {
  if (params.id === admin.id) throw new ApiError(400, "You can't remove your own account.");
  await loadTargetOrThrow(admin.organizationId, params.id);
  await prisma.user.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
});

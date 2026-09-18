import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomToken, hashToken } from "@/lib/auth/tokens";
import { sendMail, magicLinkEmail } from "@/lib/mailer";

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72h

// Always the same response whether or not the email matches an account -
// FR-4. Note this deliberately does NOT touch user.status: an unauthenticated
// caller can hit this for anyone's email, so unlike the admin-triggered
// "Reset Password" row action (FR-13), it must not be able to lock a real
// user out just by being spammed. The old password keeps working until the
// link is actually completed.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = (body?.email || "").trim().toLowerCase();

  if (email) {
    const user = await prisma.user.findFirst({ where: { email, status: "active" } });
    if (user) {
      const rawToken = randomToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { inviteTokenHash: hashToken(rawToken), inviteTokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      });

      const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
      const link = `${req.nextUrl.origin}/invite/${rawToken}`;
      const { subject, text, html } = magicLinkEmail({
        orgName: org?.name || "your organization",
        recipientName: user.name,
        link,
        isReset: true,
      });
      // Best-effort - a mail-provider hiccup must not reveal account existence
      // by changing this endpoint's response, so failures are logged, not thrown.
      if (user.email) {
        await sendMail({ to: user.email, subject, text, html }).catch((err) => console.error("forgot-password send failed:", err));
      }
    }
  }

  return NextResponse.json({ message: "If that email is on an account, we've sent a reset link." });
}

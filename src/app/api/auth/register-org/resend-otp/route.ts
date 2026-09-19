import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, hashToken } from "@/lib/auth/tokens";
import { OTP_TTL_MS, OTP_RESEND_COOLDOWN_MS } from "@/lib/auth/otp";
import { sendMail, otpEmail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = (body?.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Missing email." }, { status: 400 });

  const pending = await prisma.pendingOrgRegistration.findUnique({ where: { email } });
  if (!pending) {
    return NextResponse.json({ error: "No pending registration for that email. Start over." }, { status: 404 });
  }

  const lastSentAt = pending.otpExpiresAt.getTime() - OTP_TTL_MS;
  const waitMs = lastSentAt + OTP_RESEND_COOLDOWN_MS - Date.now();
  if (waitMs > 0) {
    return NextResponse.json({ error: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.` }, { status: 429 });
  }

  const otp = generateOtp();
  await prisma.pendingOrgRegistration.update({
    where: { email },
    data: { otpHash: hashToken(otp), otpExpiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 },
  });

  const { subject, text, html } = otpEmail({ orgName: pending.orgName, recipientName: pending.name, code: otp });
  try {
    await sendMail({ to: email, subject, text, html });
  } catch (err) {
    console.error("register-org OTP resend failed:", err);
    return NextResponse.json({ error: "Couldn't send the verification email. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ pending: true, email });
}

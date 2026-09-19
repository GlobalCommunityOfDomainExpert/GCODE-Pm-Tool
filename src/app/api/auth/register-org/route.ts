import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { generateOtp, hashToken } from "@/lib/auth/tokens";
import { OTP_TTL_MS, OTP_RESEND_COOLDOWN_MS } from "@/lib/auth/otp";
import { sendMail, otpEmail } from "@/lib/mailer";

// Step 1 of org registration: OTP-verify the founder's email before the
// Organization/User exist. Nothing is created here - orgName/name/hashed
// password are held in PendingOrgRegistration (one row per email, upserted
// so resubmitting the form just issues a fresh code) until
// /api/auth/register-org/verify-otp succeeds, which is where the
// Organization + User actually get created.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const orgName = (body?.orgName || "").trim();
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  const password = body?.password || "";

  if (!orgName || !name || !email || !password) {
    return NextResponse.json({ error: "Fill in all fields to create your organization." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.pendingOrgRegistration.findUnique({ where: { email } });
  if (existing) {
    const lastSentAt = existing.otpExpiresAt.getTime() - OTP_TTL_MS;
    const waitMs = lastSentAt + OTP_RESEND_COOLDOWN_MS - Date.now();
    if (waitMs > 0) {
      return NextResponse.json(
        { error: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.` },
        { status: 429 }
      );
    }
  }

  const passwordHash = await hashPassword(password);
  const otp = generateOtp();

  await prisma.pendingOrgRegistration.upsert({
    where: { email },
    create: {
      orgName,
      name,
      email,
      passwordHash,
      otpHash: hashToken(otp),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
    update: {
      orgName,
      name,
      passwordHash,
      otpHash: hashToken(otp),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
    },
  });

  const { subject, text, html } = otpEmail({ orgName, recipientName: name, code: otp });
  try {
    await sendMail({ to: email, subject, text, html });
  } catch (err) {
    console.error("register-org OTP send failed:", err);
    return NextResponse.json({ error: "Couldn't send the verification email. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ pending: true, email });
}

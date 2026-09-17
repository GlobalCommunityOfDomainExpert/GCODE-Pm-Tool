import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

// Lazy singleton so a missing/bad SMTP config fails at first send, not at
// module load (which would crash every route that imports this file).
function getTransporter(): Transporter {
  if (transporter) return transporter;

  const { SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD } = process.env;
  if (!SMTP_SERVER || !SMTP_PORT || !SMTP_USERNAME || !SMTP_PASSWORD) {
    throw new Error(
      "SMTP is not configured. Set SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, and EMAIL_FROM in .env."
    );
  }

  transporter = nodemailer.createTransport({
    host: SMTP_SERVER,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // 587/25 use STARTTLS instead
    auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
  });
  return transporter;
}

export async function verifyMailer(): Promise<void> {
  await getTransporter().verify();
}

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set in .env.");

  await getTransporter().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

export function magicLinkEmail(opts: { orgName: string; recipientName: string; link: string; isReset: boolean }) {
  const action = opts.isReset ? "reset your password" : "finish setting up your account";
  const subject = opts.isReset
    ? `Reset your Gcode password for ${opts.orgName}`
    : `You're invited to join ${opts.orgName} on Gcode`;
  const text = `Hi ${opts.recipientName},\n\nUse the link below to ${action}:\n${opts.link}\n\nThis link works once and expires in 72 hours.`;
  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto;">
      <p>Hi ${opts.recipientName},</p>
      <p>Use the button below to ${action} for <strong>${opts.orgName}</strong> on Gcode.</p>
      <p style="margin: 24px 0;">
        <a href="${opts.link}" style="background:#6366f1; color:#fff; padding:12px 20px; border-radius:6px; text-decoration:none; font-weight:600;">
          ${opts.isReset ? "Reset password" : "Set up your account"}
        </a>
      </p>
      <p style="color:#64748b; font-size:13px;">This link works once and expires in 72 hours. If the button doesn't work, copy this URL:<br>${opts.link}</p>
    </div>`;
  return { subject, text, html };
}

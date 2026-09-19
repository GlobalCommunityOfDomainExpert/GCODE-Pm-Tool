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

// Escapes untrusted values (org name, recipient name - both user-entered)
// before they land in the HTML body. The link itself is our own generated
// URL, never user input, so it's safe to interpolate raw.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function magicLinkEmail(opts: { orgName: string; recipientName: string; link: string; isReset: boolean }) {
  const orgName = escapeHtml(opts.orgName);
  const recipientName = escapeHtml(opts.recipientName);
  const action = opts.isReset ? "reset your password" : "finish setting up your account";
  const buttonLabel = opts.isReset ? "Reset password" : "Set up your account";
  const subject = opts.isReset
    ? `Reset your Gcode password for ${opts.orgName}`
    : `You're invited to join ${opts.orgName} on Gcode`;
  const preheader = opts.isReset
    ? `Reset your password for ${opts.orgName} - this link expires in 72 hours.`
    : `${opts.orgName} has invited you to Gcode - set up your account in the next 72 hours.`;

  const text = [
    `Hi ${opts.recipientName},`,
    "",
    opts.isReset
      ? `We received a request to reset the password on your ${opts.orgName} account on Gcode.`
      : `${opts.orgName} has invited you to join their team on Gcode.`,
    "",
    `${buttonLabel}: ${opts.link}`,
    "",
    "This link works once and expires in 72 hours.",
    opts.isReset
      ? "If you didn't request this, you can safely ignore this email - your password won't change."
      : "If you weren't expecting this invite, you can safely ignore this email.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f8fafc;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:100%; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">
            <tr>
              <td style="padding:28px 32px; border-bottom:1px solid #e2e8f0;">
                <span style="font-family:-apple-system,Segoe UI,Inter,sans-serif; font-size:20px; font-weight:700; color:#6366f1; letter-spacing:-0.02em;">Gcode</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px; font-family:-apple-system,Segoe UI,Inter,sans-serif;">
                <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#0f172a;">Hi ${recipientName},</p>
                <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#0f172a;">
                  ${
                    opts.isReset
                      ? `We received a request to reset the password on your <strong>${orgName}</strong> account on Gcode.`
                      : `<strong>${orgName}</strong> has invited you to join their team on Gcode.`
                  }
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-radius:8px; background-color:#6366f1;">
                      <a href="${opts.link}" style="display:inline-block; padding:13px 28px; font-family:-apple-system,Segoe UI,Inter,sans-serif; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                        ${buttonLabel}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 24px; font-size:13px; line-height:1.6; color:#64748b;">
                  If the button doesn't work, copy and paste this link into your browser:<br>
                  <a href="${opts.link}" style="color:#6366f1; word-break:break-all;">${opts.link}</a>
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;">
                  <tr>
                    <td style="padding-top:20px; font-size:12px; line-height:1.6; color:#64748b;">
                      This link works once and expires in 72 hours.
                      ${
                        opts.isReset
                          ? " If you didn't request this, you can safely ignore this email - your password won't change."
                          : " If you weren't expecting this invite, you can safely ignore this email."
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0; font-family:-apple-system,Segoe UI,Inter,sans-serif; font-size:12px; color:#94a3b8;">
            Sent by ${orgName} via Gcode
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export function otpEmail(opts: { orgName: string; recipientName: string; code: string }) {
  const orgName = escapeHtml(opts.orgName);
  const recipientName = escapeHtml(opts.recipientName);
  const subject = `Your Gcode verification code: ${opts.code}`;
  const preheader = `Enter this code to finish creating ${opts.orgName} on Gcode - expires in 10 minutes.`;

  const text = [
    `Hi ${opts.recipientName},`,
    "",
    `Your verification code to finish creating "${opts.orgName}" on Gcode is:`,
    "",
    opts.code,
    "",
    "This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f8fafc;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:100%; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">
            <tr>
              <td style="padding:28px 32px; border-bottom:1px solid #e2e8f0;">
                <span style="font-family:-apple-system,Segoe UI,Inter,sans-serif; font-size:20px; font-weight:700; color:#6366f1; letter-spacing:-0.02em;">Gcode</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px; font-family:-apple-system,Segoe UI,Inter,sans-serif;">
                <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#0f172a;">Hi ${recipientName},</p>
                <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#0f172a;">
                  Enter this code to finish creating <strong>${orgName}</strong> on Gcode:
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-radius:8px; background-color:#f1f5f9; padding:16px 28px;">
                      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:28px; font-weight:700; letter-spacing:6px; color:#0f172a;">${opts.code}</span>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;">
                  <tr>
                    <td style="padding-top:20px; font-size:12px; line-height:1.6; color:#64748b;">
                      This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

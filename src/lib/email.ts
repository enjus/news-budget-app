import nodemailer from "nodemailer";

/**
 * Email transport for outbound notifications.
 *
 * Uses the local postfix relay on the server (localhost:25), which forwards to
 * the org mail relay (relay-aws.advancelocal.net). No auth needed — the relay
 * trusts the server's IP. Configurable via env if we ever move to a different
 * host/port.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "25", 10),
  secure: false, // localhost:25 is plain; relay handles TLS onward
  // no auth — internal relay
  tls: { rejectUnauthorized: false },
});

const FROM_ADDRESS =
  process.env.MAIL_FROM || "News Budget <newsbudget-noreply@oregonian.com>";

export interface SendEmailParams {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email. Returns true on success, false on failure.
 * Never throws — a failed notification should not break the API request
 * that triggered it (the story/video still saved successfully).
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
}: SendEmailParams): Promise<boolean> {
  if (!to || to.length === 0) {
    console.warn("sendEmail called with no recipients — skipping");
    return false;
  }

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: to.join(", "),
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error("sendEmail failed:", error);
    return false;
  }
}

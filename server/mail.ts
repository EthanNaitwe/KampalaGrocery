import nodemailer from "nodemailer";

/** SMTP settings: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM. */
export const emailConfigured = () => !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getMailer() {
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }) {
  await getMailer().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, ...msg });
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain branded email with one button. All values are escaped. */
export function buttonEmail(opts: { heading: string; lines: string[]; button: string; url: string; footer: string }) {
  const text = [opts.heading, "", ...opts.lines, "", `${opts.button}: ${opts.url}`, "", opts.footer].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1f2937">
<p style="font-size:20px;font-weight:bold;color:#178A17">FreshMart</p>
<p style="font-size:17px;font-weight:bold">${escape(opts.heading)}</p>
${opts.lines.map((l) => `<p>${escape(l)}</p>`).join("\n")}
<p><a href="${escape(opts.url)}" style="display:inline-block;background:#178A17;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escape(opts.button)}</a></p>
<p style="font-size:12px;color:#6b7280">${escape(opts.footer)}</p>
</div>`;
  return { text, html };
}

import nodemailer from "nodemailer";

/**
 * Email goes through Brevo's HTTP API when BREVO_API_KEY is set (required on Cloudflare Workers,
 * which can't do SMTP STARTTLS), otherwise SMTP: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE,
 * SMTP_USER, SMTP_PASS. The sender is SMTP_FROM ("Name <address>" or an address) or SMTP_USER.
 */
const useBrevo = () => !!process.env.BREVO_API_KEY;
const fromHeader = () => process.env.SMTP_FROM || process.env.SMTP_USER || "";

export const emailConfigured = () =>
  useBrevo()
    ? !!fromHeader()
    : !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

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

/** "FreshMart <a@b.com>" -> { name, email }; "a@b.com" -> { email }. */
export function parseSender(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { ...(m[1] ? { name: m[1] } : {}), email: m[2].trim() };
  return { name: "FreshMart", email: from.trim() };
}

async function sendWithBrevo(msg: { to: string; subject: string; text: string; html: string }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: parseSender(fromHeader()),
      to: [{ email: msg.to }],
      subject: msg.subject,
      textContent: msg.text,
      htmlContent: msg.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    // Same shape nodemailer uses, so emailFailureMessage() can explain it.
    throw Object.assign(new Error(body.message ?? `Brevo returned ${res.status}`), {
      code: res.status === 401 ? "EAUTH" : (body.code ?? `HTTP_${res.status}`),
    });
  }
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }) {
  if (useBrevo()) return sendWithBrevo(msg);
  await getMailer().sendMail({ from: fromHeader(), ...msg });
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

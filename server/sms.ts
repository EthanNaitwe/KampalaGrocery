export const smsConfigured = () =>
  !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_PHONE_NUMBER;

/**
 * Sends one SMS through Twilio's REST API and returns the message id. Throws on provider failure.
 * Plain fetch (no SDK) so it runs on Node and Cloudflare Workers alike. The timeout is short
 * because order texts are sent inside the request.
 */
export async function sendSms(to: string, body: string, timeoutMs = 5000): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = btoa(`${sid}:${process.env.TWILIO_AUTH_TOKEN!}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_PHONE_NUMBER!, Body: body }),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e: Error) => {
    throw Object.assign(new Error(e.name === "TimeoutError" ? `SMS timed out after ${timeoutMs}ms` : e.message), { code: e.name });
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
  if (!res.ok || !data.sid) {
    throw Object.assign(new Error(data.message ?? `Twilio returned ${res.status}`), { code: data.code ?? res.status });
  }
  return data.sid;
}

/** Only real phone numbers (not email identifiers) can receive SMS. */
export const isSmsRecipient = (v: string | null | undefined): v is string => !!v && /^\+\d{8,15}$/.test(v);

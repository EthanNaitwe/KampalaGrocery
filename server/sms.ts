/**
 * SMS through Africa's Talking (preferred for Ugandan numbers) or Twilio, whichever is configured.
 * Both use plain fetch (no SDK) so this runs on Node and Cloudflare Workers alike.
 *
 * Africa's Talking: AT_USERNAME, AT_API_KEY, optional AT_SENDER_ID (a registered sender name;
 * without it messages come from AT's shared short code). AT_USERNAME=sandbox uses the sandbox,
 * which delivers only to the simulator in the AT dashboard.
 * Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.
 */
const atConfigured = () => !!process.env.AT_USERNAME && !!process.env.AT_API_KEY;
const twilioConfigured = () =>
  !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_PHONE_NUMBER;

export const smsConfigured = () => atConfigured() || twilioConfigured();

/** Error carrying a short code for logs and the notifications table (never the message body). */
const smsError = (message: string, code: string | number) => Object.assign(new Error(message), { code });

async function post(url: string, init: RequestInit, timeoutMs: number) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const err = e as Error;
    throw smsError(err.name === "TimeoutError" ? `SMS timed out after ${timeoutMs}ms` : err.message, err.name);
  }
}

// Africa's Talking per-recipient status codes: 100 Processed, 101 Sent, 102 Queued are successes.
const AT_OK = new Set([100, 101, 102]);

async function sendWithAfricasTalking(to: string, body: string, timeoutMs: number): Promise<string> {
  const username = process.env.AT_USERNAME!;
  const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const form = new URLSearchParams({ username, to, message: body });
  if (process.env.AT_SENDER_ID) form.set("from", process.env.AT_SENDER_ID);

  const res = await post(`https://${host}/version1/messaging`, {
    method: "POST",
    headers: { apiKey: process.env.AT_API_KEY!, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  }, timeoutMs);

  // Errors such as a bad API key come back as plain text, not JSON.
  const text = await res.text();
  if (!res.ok) throw smsError(`Africa's Talking returned ${res.status}: ${text.slice(0, 200)}`, res.status === 401 ? "AUTH" : res.status);
  let data: { SMSMessageData?: { Message?: string; Recipients?: Array<{ statusCode: number; status: string; messageId: string }> } };
  try {
    data = JSON.parse(text);
  } catch {
    throw smsError(`Africa's Talking sent an unexpected reply: ${text.slice(0, 200)}`, "BAD_RESPONSE");
  }
  const r = data.SMSMessageData?.Recipients?.[0];
  if (!r) throw smsError(data.SMSMessageData?.Message ?? "Message not accepted", "NO_RECIPIENT");
  if (!AT_OK.has(r.statusCode)) throw smsError(`Not sent: ${r.status}`, r.statusCode);
  return r.messageId;
}

async function sendWithTwilio(to: string, body: string, timeoutMs: number): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = btoa(`${sid}:${process.env.TWILIO_AUTH_TOKEN!}`);
  const res = await post(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_PHONE_NUMBER!, Body: body }),
  }, timeoutMs);
  const data = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
  if (!res.ok || !data.sid) throw smsError(data.message ?? `Twilio returned ${res.status}`, data.code ?? res.status);
  return data.sid;
}

/**
 * Sends one SMS and returns the provider message id. Throws on provider failure. The timeout is
 * short because order texts are sent inside the request.
 */
export async function sendSms(to: string, body: string, timeoutMs = 8000): Promise<string> {
  if (atConfigured()) return sendWithAfricasTalking(to, body, timeoutMs);
  return sendWithTwilio(to, body, timeoutMs);
}

/** Only real phone numbers (not email identifiers) can receive SMS. */
export const isSmsRecipient = (v: string | null | undefined): v is string => !!v && /^\+\d{8,15}$/.test(v);

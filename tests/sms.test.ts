/** SMS provider selection and Africa's Talking response handling (fetch is faked; nothing is sent). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendSms, smsConfigured } from "../server/sms.js";

const KEYS = ["AT_USERNAME", "AT_API_KEY", "AT_SENDER_ID", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"];
let saved: Record<string, string | undefined>;
const fetchMock = vi.fn();

const atReply = (statusCode: number, status: string) =>
  new Response(JSON.stringify({ SMSMessageData: { Message: "Sent to 1/1", Recipients: [{ statusCode, status, number: "+256700000001", messageId: "ATXid_1" }] } }), { status: 201 });

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
});

describe("Africa's Talking SMS", () => {
  it("is used when configured, with the sender id, and returns the message id", async () => {
    Object.assign(process.env, { AT_USERNAME: "freshmart", AT_API_KEY: "k", AT_SENDER_ID: "FreshMart" });
    expect(smsConfigured()).toBe(true);
    fetchMock.mockResolvedValue(atReply(101, "Success"));

    expect(await sendSms("+256700000001", "Your code is 123456")).toBe("ATXid_1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.africastalking.com/version1/messaging");
    expect(init.headers.apiKey).toBe("k");
    const form = new URLSearchParams(init.body);
    expect(Object.fromEntries(form)).toEqual({ username: "freshmart", to: "+256700000001", message: "Your code is 123456", from: "FreshMart" });
  });

  it("uses the sandbox host for the sandbox username", async () => {
    Object.assign(process.env, { AT_USERNAME: "sandbox", AT_API_KEY: "k" });
    fetchMock.mockResolvedValue(atReply(101, "Success"));
    await sendSms("+256700000001", "hi");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.sandbox.africastalking.com/version1/messaging");
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).has("from")).toBe(false);
  });

  it("throws when the recipient is rejected or the key is wrong", async () => {
    Object.assign(process.env, { AT_USERNAME: "freshmart", AT_API_KEY: "k" });
    fetchMock.mockResolvedValueOnce(atReply(403, "InvalidPhoneNumber"));
    await expect(sendSms("+256700000001", "hi")).rejects.toMatchObject({ code: 403, message: "Not sent: InvalidPhoneNumber" });

    fetchMock.mockResolvedValueOnce(new Response("The supplied authentication is invalid", { status: 401 }));
    await expect(sendSms("+256700000001", "hi")).rejects.toMatchObject({ code: "AUTH" });
  });

  it("falls back to Twilio, and reports unconfigured", async () => {
    expect(smsConfigured()).toBe(false);
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_PHONE_NUMBER: "+15550000000" });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }));
    expect(await sendSms("+256700000001", "hi")).toBe("SM1");
    expect(fetchMock.mock.calls[0][0]).toContain("api.twilio.com");
  });
});

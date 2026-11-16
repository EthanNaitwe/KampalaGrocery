/**
 * Staff console accounts: email + password, kept apart from customer accounts.
 * Owners invite staff by email; anyone can reset a forgotten password through an emailed link.
 */
import { createHash, randomBytes } from "crypto";
import type { RequestHandler } from "express";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./db.js";
import { HttpError, sendError } from "./http.js";
import { devLogOtp, isProduction } from "./config.js";
import { buttonEmail, emailConfigured, sendEmail } from "./mail.js";
import { checkPassword, hashPassword, LOCK_MINUTES, MAX_FAILED_ATTEMPTS } from "./passwords.js";
import { admins, adminTokens, type Admin, type AdminRole } from "../shared/schema.js";
import type { AdminProfile, StaffMember } from "../shared/api.js";

export const INVITE_HOURS = 72;
export const RESET_MINUTES = 60;
/** At most one reset email per account in this window, so the form can't be used to flood an inbox. */
const RESET_COOLDOWN_SECONDS = 120;

export const profile = (a: Admin): AdminProfile => ({ id: a.id, email: a.email, name: a.name, role: a.role as AdminRole });

export const staffMember = (a: Admin): StaffMember => ({
  ...profile(a),
  active: a.active,
  hasPassword: !!a.passwordHash,
  lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(),
});

const byEmail = async (email: string) => (await db.select().from(admins).where(eq(admins.email, email.trim().toLowerCase())))[0];
export const getAdmin = async (id: string) => (await db.select().from(admins).where(eq(admins.id, id)))[0];

// ---- Sign-in ------------------------------------------------------------------
let dummyHash: Promise<string> | null = null;
async function burnTime(password: string) {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await checkPassword(password, await dummyHash);
}

const invalid = () => new HttpError("UNAUTHORIZED", "Wrong email or password");

/** Email + password. Same lockout rules as customer passwords: 5 wrong tries, then 15 minutes. */
export async function loginAdmin(email: string, password: string): Promise<Admin> {
  const a = await byEmail(email);
  if (!a || !a.active || !a.passwordHash) {
    await burnTime(password);
    throw invalid();
  }
  if (a.lockedUntil && a.lockedUntil > new Date()) {
    const mins = Math.ceil((a.lockedUntil.getTime() - Date.now()) / 60000);
    throw new HttpError("RATE_LIMITED", `Too many wrong attempts. Try again in ${mins} min or reset your password.`);
  }
  if (!(await checkPassword(password, a.passwordHash))) {
    await db.execute(sql`
      update admins set
        locked_until = case when failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS}
          then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end,
        failed_attempts = case when failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS} then 0 else failed_attempts + 1 end
      where id = ${a.id}`);
    throw invalid();
  }
  const [updated] = await db
    .update(admins)
    .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(admins.id, a.id))
    .returning();
  return updated;
}

/** New session id on every sign-in (prevents fixation); any customer session on this browser is replaced. */
export async function startAdminSession(req: any, admin: Admin): Promise<void> {
  await new Promise<void>((resolve, reject) => req.session.regenerate((err: any) => (err ? reject(err) : resolve())));
  req.session.adminId = admin.id;
  await new Promise<void>((resolve, reject) => req.session.save((err: any) => (err ? reject(err) : resolve())));
}

/** Signs the admin out everywhere (after a password change, reset or deactivation). */
async function endAdminSessions(adminId: string) {
  await db.execute(sql`delete from sessions where sess->>'adminId' = ${adminId}`);
}

export async function changeAdminPassword(admin: Admin, currentPassword: string, password: string, req: any) {
  if (!admin.passwordHash || !(await checkPassword(currentPassword, admin.passwordHash))) {
    throw new HttpError("UNAUTHORIZED", "Your current password is wrong");
  }
  await db.update(admins).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(admins.id, admin.id));
  await endAdminSessions(admin.id);
  await startAdminSession(req, admin); // keep this browser signed in
}

// ---- Middleware -----------------------------------------------------------------
/** Console routes: a signed-in, active staff account (cookie session). Sets req.admin. */
export const requireStaff: RequestHandler = async (req: any, res, next) => {
  const adminId = req.session?.adminId;
  if (!adminId) return sendError(res, "UNAUTHORIZED", "Please sign in to the staff console");
  try {
    const a = await getAdmin(adminId);
    if (!a || !a.active) return sendError(res, "UNAUTHORIZED", "Please sign in to the staff console");
    req.admin = a;
    next();
  } catch (error) {
    console.error("Admin lookup failed:", (error as Error).message);
    sendError(res, "SERVICE_UNAVAILABLE", "Service temporarily unavailable");
  }
};

/** Owner-only actions. Use after requireStaff. */
export const requireOwner: RequestHandler = (req: any, res, next) => {
  if (req.admin?.role !== "owner") return sendError(res, "FORBIDDEN", "Only an owner can do this");
  next();
};

// ---- Invite and reset links -------------------------------------------------------
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Where emailed links point. Set CONSOLE_URL in production; never derived from request headers. */
function consoleUrl() {
  const url = process.env.CONSOLE_URL?.replace(/\/+$/, "");
  if (url) return url;
  if (isProduction) throw new HttpError("SERVICE_UNAVAILABLE", "CONSOLE_URL is not configured");
  return `http://localhost:${process.env.PORT || 5000}`;
}

async function issueToken(adminId: string, purpose: "invite" | "reset") {
  const token = randomBytes(32).toString("base64url");
  const ttl = purpose === "invite" ? sql`make_interval(hours => ${INVITE_HOURS})` : sql`make_interval(mins => ${RESET_MINUTES})`;
  await db.transaction(async (tx) => {
    // Only the newest link works.
    await tx.update(adminTokens).set({ usedAt: new Date() }).where(and(eq(adminTokens.adminId, adminId), isNull(adminTokens.usedAt)));
    await tx.execute(sql`
      insert into admin_tokens (admin_id, token_hash, purpose, expires_at)
      values (${adminId}, ${sha256(token)}, ${purpose}, now() + ${ttl})`);
  });
  return `${consoleUrl()}/set-password?token=${token}`;
}

/** Returns "email" when sent, or "logged" when (development only) the link was printed instead. */
async function deliver(to: string, subject: string, body: ReturnType<typeof buttonEmail>, url: string): Promise<"email" | "logged"> {
  if (!emailConfigured()) {
    if (devLogOtp) {
      console.log(`[dev] ${subject} for ${to}: ${url}`);
      return "logged";
    }
    throw new HttpError("SERVICE_UNAVAILABLE", "Email isn't set up yet (SMTP settings missing)");
  }
  try {
    await sendEmail({ to, subject, ...body });
    return "email";
  } catch (error: any) {
    console.error("Staff email failed:", error?.code ?? "", error?.responseCode ?? "", error?.response ?? error?.message);
    throw new HttpError("SERVICE_UNAVAILABLE", emailFailureMessage(error));
  }
}

/** A message the owner can act on, without exposing server details. */
function emailFailureMessage(error: any) {
  if (error?.code === "EAUTH") return process.env.BREVO_API_KEY
    ? "Brevo rejected the API key. Check BREVO_API_KEY."
    : "The email server rejected the SMTP login. Check SMTP_USER and SMTP_PASS (Gmail needs an App Password).";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(error?.code)) return "Couldn't reach the email server. Check SMTP_HOST and SMTP_PORT.";
  return "Could not send the email. Please try again.";
}

const NOT_EMAILED = "Email isn't set up on the server (SMTP settings missing), so the link was printed in the server log instead.";

export async function sendInvite(a: Admin, invitedBy: Admin): Promise<"email" | "logged"> {
  const url = await issueToken(a.id, "invite");
  return deliver(a.email, "Your FreshMart staff console invite", buttonEmail({
    heading: `Hi ${a.name}, you've been added to the FreshMart staff console`,
    lines: [`${invitedBy.name} added you as ${a.role === "owner" ? "an owner" : "staff"}. Choose a password to get started.`],
    button: "Set your password",
    url,
    footer: `This link works once and expires in ${INVITE_HOURS} hours. If you weren't expecting it, ignore this email.`,
  }), url);
}

/**
 * Forgot password. Always looks the same to the caller, whether or not the email has an account,
 * so the form can't be used to discover staff emails. Delivery problems are logged, not returned.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const a = await byEmail(email);
  if (!a || !a.active) return;
  const { rows } = await db.execute(sql`
    select 1 from admin_tokens where admin_id = ${a.id} and purpose = 'reset'
      and created_at > now() - make_interval(secs => ${RESET_COOLDOWN_SECONDS})`);
  if (rows.length) return;
  try {
    const url = await issueToken(a.id, "reset");
    await deliver(a.email, "Reset your FreshMart staff password", buttonEmail({
      heading: "Reset your password",
      lines: [`Hi ${a.name}, someone (hopefully you) asked to reset the password for the FreshMart staff console.`],
      button: "Choose a new password",
      url,
      footer: `This link works once and expires in ${RESET_MINUTES} minutes. If you didn't ask for it, ignore this email; your password stays the same.`,
    }), url);
  } catch (error) {
    console.error("Password reset email not sent:", (error as Error).message);
  }
}

/** Invite acceptance or reset: spend the token, set the password, sign out other sessions. */
export async function setPasswordWithToken(token: string, password: string): Promise<Admin> {
  const hash = await hashPassword(password);
  const admin = await db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ admin_id: string }>(sql`
      update admin_tokens set used_at = now()
      where token_hash = ${sha256(token)} and used_at is null and expires_at > now()
      returning admin_id`);
    if (!rows[0]) throw new HttpError("UNAUTHORIZED", "This link has expired or was already used. Ask for a new one.");
    const [a] = await tx
      .update(admins)
      .set({ passwordHash: hash, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(and(eq(admins.id, rows[0].admin_id), eq(admins.active, true)))
      .returning();
    if (!a) throw new HttpError("UNAUTHORIZED", "This account is switched off. Ask an owner to turn it back on.");
    return a;
  });
  await endAdminSessions(admin.id);
  return admin;
}

// ---- Owner: manage staff -------------------------------------------------------------
export async function listStaff(): Promise<StaffMember[]> {
  return (await db.select().from(admins).orderBy(asc(admins.createdAt))).map(staffMember);
}

export async function createStaff(by: Admin, body: { email: string; name: string; role: AdminRole }) {
  if (await byEmail(body.email)) throw new HttpError("CONFLICT", "There's already a staff account with this email");
  const [a] = await db.insert(admins).values({ id: nanoid(), email: body.email, name: body.name, role: body.role }).returning();
  try {
    const how = await sendInvite(a, by);
    return how === "email"
      ? { member: staffMember(a), inviteSent: true }
      : { member: staffMember(a), inviteSent: false, inviteError: NOT_EMAILED };
  } catch (error) {
    // Keep the account so the invite can be re-sent once email works.
    return { member: staffMember(a), inviteSent: false, inviteError: (error as Error).message };
  }
}

export async function updateStaff(by: Admin, id: string, body: { name?: string; role?: AdminRole; active?: boolean }) {
  return db.transaction(async (tx) => {
    // Serialise owner changes so two owners can't demote each other at the same moment.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('admins:owners'))`);
    const [a] = await tx.select().from(admins).where(eq(admins.id, id));
    if (!a) throw new HttpError("NOT_FOUND", "Staff member not found");
    const losesOwner = a.role === "owner" && a.active && (body.role === "staff" || body.active === false);
    if (losesOwner) {
      if (a.id === by.id) throw new HttpError("CONFLICT", "You can't remove your own owner access. Ask another owner.");
      const { rows } = await tx.execute<{ n: string }>(sql`select count(*) as n from admins where role = 'owner' and active`);
      if (Number(rows[0].n) <= 1) throw new HttpError("CONFLICT", "FreshMart needs at least one active owner");
    }
    const [updated] = await tx.update(admins).set({ ...body, updatedAt: new Date() }).where(eq(admins.id, id)).returning();
    if (body.active === false) await tx.execute(sql`delete from sessions where sess->>'adminId' = ${id}`);
    return staffMember(updated);
  });
}

export async function resendInvite(by: Admin, id: string) {
  const a = await getAdmin(id);
  if (!a) throw new HttpError("NOT_FOUND", "Staff member not found");
  if (!a.active) throw new HttpError("CONFLICT", "Turn this account back on first");
  return (await sendInvite(a, by)) === "email"
    ? { emailed: true, message: `Invite emailed to ${a.email}` }
    : { emailed: false, message: NOT_EMAILED };
}

// ---- Command line (scripts/admin.ts) ---------------------------------------------------
export async function createAdminDirect(email: string, name: string, role: AdminRole, password: string) {
  if (await byEmail(email)) throw new Error(`An admin with ${email} already exists`);
  const [a] = await db
    .insert(admins)
    .values({ id: nanoid(), email: email.trim().toLowerCase(), name, role, passwordHash: await hashPassword(password) })
    .returning();
  return a;
}

export async function setPasswordDirect(email: string, password: string) {
  const a = await byEmail(email);
  if (!a) throw new Error(`No admin with ${email}`);
  await db
    .update(admins)
    .set({ passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: null, active: true, updatedAt: new Date() })
    .where(eq(admins.id, a.id));
  await endAdminSessions(a.id);
  return a;
}

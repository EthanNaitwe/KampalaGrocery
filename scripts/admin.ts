/**
 * Staff console accounts from the command line (for the first owner, or when nobody can sign in).
 *
 *   npm run admin -- create you@example.com "Your Name"            (owner by default)
 *   npm run admin -- create helper@example.com "Helper" --staff
 *   npm run admin -- reset-password you@example.com
 *   npm run admin -- list
 *
 * Passwords are typed at a hidden prompt, never passed as arguments (they'd land in shell history).
 */
import "dotenv/config";
import readline from "readline";
import { Writable } from "stream";

const [command, email, name, ...flags] = process.argv.slice(2);

function usage(): never {
  console.log(`Usage:
  npm run admin -- create <email> "<name>" [--staff]
  npm run admin -- reset-password <email>
  npm run admin -- list`);
  process.exit(1);
}

/** Reads a line without echoing it to the terminal. */
function hidden(prompt: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function askPassword(): Promise<string> {
  for (;;) {
    const pw = await hidden("New password (at least 8 characters): ");
    if (pw.length < 8 || pw.length > 128) {
      console.log("Use 8 to 128 characters.");
      continue;
    }
    if ((await hidden("Type it again: ")) !== pw) {
      console.log("They don't match, try again.");
      continue;
    }
    return pw;
  }
}

async function main() {
  const { createAdminDirect, listStaff, setPasswordDirect } = await import("../server/adminAuth.js");
  const { pool } = await import("../server/db.js");
  try {
    if (command === "list") {
      const rows = await listStaff();
      if (!rows.length) console.log("No staff accounts yet.");
      console.table(rows.map((r) => ({ email: r.email, name: r.name, role: r.role, active: r.active, password: r.hasPassword ? "set" : "not set" })));
    } else if (command === "create") {
      if (!email || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) usage();
      const role = flags.includes("--staff") ? "staff" : "owner";
      const a = await createAdminDirect(email, name.trim(), role, await askPassword());
      console.log(`Created ${a.role} ${a.email}. Sign in to the staff console with this email and password.`);
    } else if (command === "reset-password") {
      if (!email) usage();
      const a = await setPasswordDirect(email, await askPassword());
      console.log(`Password changed for ${a.email}. Their other sessions were signed out and the account is active.`);
    } else {
      usage();
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();

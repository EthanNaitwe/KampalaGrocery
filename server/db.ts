import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { RequestHandler } from "express";
import ws from "ws";
import * as schema from "../shared/schema.js";
import { onWorkers } from "./config.js";

// Workers have a global WebSocket (and wrangler aliases `ws` to it); Node uses the ws package.
neonConfig.webSocketConstructor = ws;

function connect() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return { pool, db: drizzle({ client: pool, schema }) };
}
type Conn = ReturnType<typeof connect>;

// On Node one pool serves the whole process. On Workers each request opens its own pool
// (connections can't cross requests) and closes it when the response is done.
const scope = new AsyncLocalStorage<Conn>();
let shared: Conn | undefined;
function current(): Conn {
  if (!onWorkers) return (shared ??= connect());
  const conn = scope.getStore();
  if (!conn) throw new Error("Database used outside a request (wrap it in dbScope)");
  return conn;
}

function forward<T extends object>(pick: (c: Conn) => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const target = pick(current()) as any;
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export const pool: Pool = forward((c) => c.pool);
export const db: Conn["db"] = forward((c) => c.db);

/** Express middleware: gives each request its own database pool on Workers (no-op on Node). */
export const dbScope: RequestHandler = (_req, res, next) => {
  if (!onWorkers) return next();
  const conn = connect();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    conn.pool.end().catch(() => {});
  };
  res.on("finish", close);
  res.on("close", close);
  scope.run(conn, next);
};

/** Runs work outside a request (e.g. a scheduled job) with its own pool, closed afterwards. */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  if (!onWorkers) return fn();
  const conn = connect();
  try {
    return await scope.run(conn, fn);
  } finally {
    await conn.pool.end().catch(() => {});
  }
}

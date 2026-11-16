// Cloudflare Workers entry. Static console files are served by Workers Assets (wrangler.jsonc);
// only /api/* reaches Express.
import { httpServerHandler } from "cloudflare:node";
import app from "./index.js";
import { pool, withDb } from "./db.js";

const PORT = 8787;
app.listen(PORT);
const http = httpServerHandler({ port: PORT });

export default {
  ...http,
  // Daily (wrangler.jsonc "triggers"): Workers have no timers, so expired web sessions are pruned here.
  async scheduled(_event: unknown, _env: unknown, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(withDb(() => pool.query("delete from sessions where expire < now()")));
  },
};

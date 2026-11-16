import express from "express";
import { registerRoutes } from "./routes.js";
import { setupAuth } from "./smsAuth.js";
import { dbScope } from "./db.js";

// Simple logging function for production
const log = (message: string, source = "express") => {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
};

const app = express();
export { app };

// First, so everything below (sessions included) runs inside the request's database scope.
app.use(dbScope);
// JSON only: no form-encoded parsing, which also keeps classic cross-site form posts out.
app.use(express.json({ limit: "100kb" }));

// Access log: method, path, status and timing only. Bodies are never logged because they
// carry tokens, phone numbers and addresses.
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    if (path.startsWith("/api")) log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
  });
  next();
});

// Session middleware must be registered before the API routes.
setupAuth(app);
registerRoutes(app);

// Kept for server/dev.ts, which awaits setup before attaching Vite.
export async function setup() {}

export default app;

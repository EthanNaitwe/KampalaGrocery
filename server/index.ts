import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { pool } from "./db.js";
import { registerRoutes } from "./routes.js";
import { setupAuth } from "./smsAuth.js";
import path from "path";

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

// Export app for Vercel
export { app };
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

let setupPromise: Promise<void> | null = null;

export async function setup() {
  if (!setupPromise) {
    setupPromise = (async () => {
      await registerRoutes(app);
    })();
  }
  await setupPromise;
}

// Ensure session middleware is registered before handling requests
setupAuth(app);

app.use(async (req: Request, res: Response, next: NextFunction) => {
  await setup();
  next();
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", database: "ok" });
  } catch (err) {
    console.error("Database health check failed:", err);
    res.status(503).json({ status: "degraded", database: "unreachable" });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  // Serve static files from the dist directory
  app.use(express.static(path.join(process.cwd(), "dist")));

  // Handle client-side routing by serving index.html for non-API routes
  app.get("*", (req: Request, res: Response) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    }
  });
}

export default app;

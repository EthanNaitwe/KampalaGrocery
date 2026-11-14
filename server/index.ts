import "dotenv/config";
import express, { type Request, Response } from "express";
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

// Session middleware must be registered before the API routes.
setupAuth(app);
registerRoutes(app);

// Kept for server/dev.ts, which awaits setup before attaching Vite.
export async function setup() {}

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

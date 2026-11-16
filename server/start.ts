// Production entry for long-running Node hosts (`npm start`). Cloudflare uses server/worker.ts.
import "dotenv/config";
import express, { type Request, type Response } from "express";
import path from "path";
import app from "./index.js";

// The console build, with client-side routing falling back to index.html.
const dist = path.join(process.cwd(), "dist");
app.use(express.static(dist));
app.get("*", (req: Request, res: Response) => {
  if (!req.path.startsWith("/api")) res.sendFile(path.join(dist, "index.html"));
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`FreshMart API listening on port ${port}`));

import "dotenv/config";
import { createServer } from "vite";
import app, { setup } from "./index.js";

const port = Number(process.env.PORT || 5000);

async function start() {
  await setup();

  const vite = await createServer({
    appType: "spa",
    server: { middlewareMode: true },
  });

  app.use(vite.middlewares);

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

void start().catch((error) => {
  console.error("Failed to start development server:", error);
  process.exitCode = 1;
});

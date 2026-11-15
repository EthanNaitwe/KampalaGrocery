// Production entry for long-running hosts (`npm start`). Vercel uses api/index.ts instead.
import app from "./index.js";

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`FreshMart API listening on port ${port}`));

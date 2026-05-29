// scripts/dev-api.mjs
// Standalone Node dev server that wraps the Vercel handler at api/signals.js.
// Run with: npm run dev:api  →  http://localhost:8787/api/signals
import http from "node:http";
import handler from "../api/signals.js";

const port = parseInt(process.env.PORT || "8787", 10);

http
  .createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (url === "/api/signals" || url === "/") return handler(req, res);
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "not found", path: url }));
  })
  .listen(port, () => {
    console.log(`[culturepulse] dev API → http://localhost:${port}/api/signals`);
  });

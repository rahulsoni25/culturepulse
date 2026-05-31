// scripts/dev-api.mjs
// Standalone Node dev server that wraps the Vercel handlers.
// Run with: npm run dev:api  →  http://localhost:8787/api/...
import http from "node:http";
import signalsHandler from "../api/signals.js";
import pulseReportHandler from "../api/pulse-report.js";
import freshnessHandler from "../api/agent-freshness.js";
import qualityHandler   from "../api/agent-quality.js";
import dropsHandler     from "../api/drops.js";
import reviewerHandler  from "../api/agent-reviewer.js";
import cultureScoreHandler from "../api/culture-score.js";

const routes = {
  "/api/culture-score":   cultureScoreHandler,
  "/api/signals":         signalsHandler,
  "/api/pulse-report":    pulseReportHandler,
  "/api/drops":           dropsHandler,
  "/api/agent-freshness": freshnessHandler,
  "/api/agent-quality":   qualityHandler,
  "/api/agent-reviewer":  reviewerHandler,
};

const port = parseInt(process.env.PORT || "8787", 10);

http
  .createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];
    const fn = routes[url] || (url === "/" ? signalsHandler : null);
    if (fn) return fn(req, res);
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "not found", path: url, routes: Object.keys(routes) }));
  })
  .listen(port, () => {
    console.log(`[culturepulse] dev API → http://localhost:${port}`);
    Object.keys(routes).forEach((r) => console.log(`  • ${r}`));
  });

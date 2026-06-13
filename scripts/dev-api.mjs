// scripts/dev-api.mjs
// Standalone Node dev server that wraps the Vercel handlers.
// Run with: npm run dev:api  →  http://localhost:8787/api/...
import http from "node:http";
import signalsHandler from "../api/signals.js";
import pulseReportHandler from "../api/pulse-report.js";
import dropsHandler     from "../api/drops.js";
import cultureScoreHandler from "../api/culture-score.js";
import gtrendsHandler    from "../api/gtrends.js";

// Note: the agent modules (freshness/quality/reviewer) are no longer standalone
// HTTP routes — they run inside /api/drops and /api/pulse-report via named
// exports. Their default handlers were removed to stay under Vercel's 12-function
// Hobby limit when /api/gtrends was added.
const routes = {
  "/api/gtrends":         gtrendsHandler,
  "/api/culture-score":   cultureScoreHandler,
  "/api/signals":         signalsHandler,
  "/api/pulse-report":    pulseReportHandler,
  "/api/drops":           dropsHandler,
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

// api/agent-freshness.js
// ──────────────────────────────────────────────────────────────────────────────
// FRESHNESS AGENT
//
// Job: when a Pulse Report is generated, audit the underlying signals for
// recency, distribution, and coverage. The output is shown to the user as a
// "Trust" panel under the brief — they can see at a glance whether the brief
// was built on fresh, diverse data or whether anything is stale/thin.
//
// This agent is pure JS / heuristics today. The contract (the verdict JSON
// shape) is stable, so we can replace the internals with an LLM-driven
// check later without touching the consumer.
//
// Contract (the verdict object):
//   {
//     agent: "freshness",
//     model: "rules-v1",                  // future: "gemini-2.5-flash"
//     score: 0..100,                      // overall freshness score
//     passed: boolean,                    // true iff every error-severity check passes
//     summary: string,                    // single sentence shown in the UI badge
//     checks: [
//       { name, severity: "info|warn|error", passed: boolean, detail: string }
//     ],
//     metrics: { ... raw measurements for the geeks ... }
//   }
// ──────────────────────────────────────────────────────────────────────────────

// Thresholds — tuned so a normal run passes, but a degenerate one (stale,
// single-source, too few signals) fails visibly.
const T = {
  MIN_SIGNALS:      8,    // below this the brief is too thin
  WARN_SIGNALS:    15,    // 8-15 = warn, 15+ = good
  MAX_AGE_HOURS:   48,    // any signal older than this drags the score
  MAX_AGE_FATAL:  168,    // 7 days — if ANYTHING is this stale, fail loud
  MIN_SOURCES:      2,    // need at least 2 distinct sources (trends/news/wiki)
  MAX_SINGLE_SHARE: 0.85, // no single source should be >85% of signals
};

function ageHoursOf(s) {
  if (s.hours_ago != null) return s.hours_ago;
  if (s.fetched_at) {
    const t = Date.parse(s.fetched_at);
    if (!isNaN(t)) return Math.max(0, (Date.now() - t) / 36e5);
  }
  return 0; // freshly built signals without a timestamp = treat as new
}

export function runFreshnessAgent({ signals = [], brief = {} } = {}) {
  const checks = [];
  const count = signals.length;

  // ── 1. Signal volume ──────────────────────────────────────────────────────
  if (count < T.MIN_SIGNALS) {
    checks.push({
      name: "signal-volume",
      severity: "error",
      passed: false,
      detail: `Only ${count} signals captured — below the ${T.MIN_SIGNALS}-signal floor. Brief may be too thin to act on.`,
    });
  } else if (count < T.WARN_SIGNALS) {
    checks.push({
      name: "signal-volume",
      severity: "warn",
      passed: true,
      detail: `${count} signals captured — above floor but thinner than typical. Consider re-running closer to a peak news cycle.`,
    });
  } else {
    checks.push({
      name: "signal-volume",
      severity: "info",
      passed: true,
      detail: `${count} signals captured — healthy coverage.`,
    });
  }

  // ── 2. Recency distribution ───────────────────────────────────────────────
  const ages = signals.map(ageHoursOf);
  const oldest = ages.length ? Math.max(...ages) : 0;
  const median = ages.length ? [...ages].sort((a, b) => a - b)[Math.floor(ages.length / 2)] : 0;
  const stalePct = ages.length ? ages.filter((h) => h > T.MAX_AGE_HOURS).length / ages.length : 0;

  if (oldest > T.MAX_AGE_FATAL) {
    checks.push({
      name: "recency",
      severity: "error",
      passed: false,
      detail: `Oldest signal is ${Math.round(oldest)}h (${Math.round(oldest / 24)}d) old — that's past the 7-day staleness fatal line. Refresh before sending to a client.`,
    });
  } else if (stalePct > 0.4) {
    checks.push({
      name: "recency",
      severity: "warn",
      passed: true,
      detail: `${Math.round(stalePct * 100)}% of signals are older than ${T.MAX_AGE_HOURS}h. Median age ${Math.round(median)}h.`,
    });
  } else {
    checks.push({
      name: "recency",
      severity: "info",
      passed: true,
      detail: `Median signal age ${Math.round(median)}h · oldest ${Math.round(oldest)}h. Within freshness window.`,
    });
  }

  // ── 3. Source diversity ───────────────────────────────────────────────────
  const sourceCounts = {};
  signals.forEach((s) => {
    sourceCounts[s.source || "unknown"] = (sourceCounts[s.source || "unknown"] || 0) + 1;
  });
  const sourceKeys = Object.keys(sourceCounts);
  const maxShare = sourceKeys.length ? Math.max(...Object.values(sourceCounts)) / count : 0;

  if (sourceKeys.length < T.MIN_SOURCES) {
    checks.push({
      name: "source-diversity",
      severity: "error",
      passed: false,
      detail: `Only ${sourceKeys.length} source(s) feeding the brief (${sourceKeys.join(", ") || "none"}). Brief is essentially single-source.`,
    });
  } else if (maxShare > T.MAX_SINGLE_SHARE) {
    const dominant = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];
    checks.push({
      name: "source-diversity",
      severity: "warn",
      passed: true,
      detail: `${Math.round(maxShare * 100)}% of signals from one source (${dominant[0]}). Brief is overweight to a single channel.`,
    });
  } else {
    checks.push({
      name: "source-diversity",
      severity: "info",
      passed: true,
      detail: `${sourceKeys.length} sources: ${sourceKeys.map((k) => `${k} ${sourceCounts[k]}`).join(" · ")}.`,
    });
  }

  // ── 4. Brief age vs signal age ────────────────────────────────────────────
  const briefGeneratedAt = brief.generated_at ? Date.parse(brief.generated_at) : Date.now();
  const briefAgeMin = (Date.now() - briefGeneratedAt) / 60000;
  if (briefAgeMin > 60 * 24 * 7) {
    checks.push({
      name: "brief-age",
      severity: "warn",
      passed: true,
      detail: `Brief was generated ${Math.round(briefAgeMin / 60 / 24)}d ago. Regenerate before forwarding.`,
    });
  } else {
    checks.push({
      name: "brief-age",
      severity: "info",
      passed: true,
      detail: `Brief generated ${briefAgeMin < 60 ? Math.round(briefAgeMin) + "m" : Math.round(briefAgeMin / 60) + "h"} ago.`,
    });
  }

  // ── Score + summary ───────────────────────────────────────────────────────
  // Score = 100 minus penalties: each warn -10, each error -25.
  const score = Math.max(
    0,
    100 -
      checks.filter((c) => c.severity === "warn").length * 10 -
      checks.filter((c) => c.severity === "error").length * 25
  );
  const passed = !checks.some((c) => c.severity === "error" && !c.passed);
  const summary = passed
    ? score >= 95
      ? "All freshness checks pass."
      : `${checks.filter((c) => c.severity === "warn").length} warning(s) — brief is publishable.`
    : "Critical freshness issues — do not forward without refresh.";

  return {
    agent: "freshness",
    model: "rules-v1",
    score,
    passed,
    summary,
    checks,
    metrics: {
      signal_count: count,
      median_age_hours: Math.round(median),
      oldest_age_hours: Math.round(oldest),
      stale_share: +stalePct.toFixed(2),
      sources: sourceCounts,
    },
  };
}

// HTTP handler — exposes the agent so it's inspectable independent of the
// pulse-report pipeline (e.g. for monitoring, debugging, or a future
// dashboard showing agent-runs over time).
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  try {
    const { buildSignals } = await import("./signals.js");
    const signals = await buildSignals();
    const verdict = runFreshnessAgent({ signals, brief: { generated_at: new Date().toISOString() } });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, ...verdict }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
}

// api/culture-score.js
// ──────────────────────────────────────────────────────────────────────────────
// CULTURE SCORE — the decision layer.
//
// Turns the opaque internal "lift" number into a human-readable 0-100 score
// with a plain-English verdict, so a planner can decide: should I integrate
// this into the campaign or not?
//
// Two entry points share one model:
//   • scoreTheme(...)  — scores a Culture Drop theme (used by /api/drops)
//   • scoreQuery(...)  — scores a free-text culture idea typed by the user
//                        e.g. "Bhajan clubbing", "sober raves", "desi techno"
//                        (used by /api/culture-score?q=...)
//
// Composite = Momentum 35% + Brand-fit 30% + Timing 20% + Evidence 15%.
// Every sub-score is returned so the number is transparent, not a black box.
// ──────────────────────────────────────────────────────────────────────────────

import { buildSignals } from "./signals.js";
import { getPersona } from "./personas.js";

// Brand lens weights (slim copy — avoids circular import with pulse-report).
const BRAND_WEIGHTS = {
  tuborg:     { music_streaming:1.6, festivals:1.5, late_night_out:1.4, food_delivery:1.2, gaming_mobile:1.1, fashion_sneakers:1.0, cricket_watching:0.7, digital_expresser:1.1, travel_weekend:1.0, cultural_explorer:1.1 },
  heineken:   { music_streaming:1.2, festivals:1.3, late_night_out:1.5, fashion_sneakers:1.4, travel_weekend:1.3, cricket_watching:0.9, food_delivery:1.0, gaming_mobile:1.0, digital_expresser:1.1, cultural_explorer:1.2 },
  kingfisher: { cricket_watching:2.0, food_delivery:1.4, festivals:1.1, late_night_out:1.1, music_streaming:1.0, gaming_mobile:0.9, fashion_sneakers:0.7, travel_weekend:1.2, digital_expresser:0.9, cultural_explorer:0.9 },
  bira91:     { fashion_sneakers:1.7, music_streaming:1.4, festivals:1.3, digital_expresser:1.5, food_delivery:1.2, late_night_out:1.3, gaming_mobile:1.0, cricket_watching:0.6, travel_weekend:1.1, cultural_explorer:1.3 },
};
const brandKey = (b) => String(b || "tuborg").toLowerCase().replace(/[^a-z]/g, "");
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// ── Verdict bands ────────────────────────────────────────────────────────────
function verdictFor(score) {
  if (score >= 78) return { label: "Integrate now", tone: "green",
    line: "Strong fit, clearly rising, early enough to own. Put it in the campaign." };
  if (score >= 60) return { label: "Pilot it", tone: "green",
    line: "Real momentum and good fit. Run a focused test before scaling spend." };
  if (score >= 42) return { label: "Watch", tone: "amber",
    line: "On the radar but not proven for this brand yet. Monitor, don't commit budget." };
  return { label: "Skip for now", tone: "red",
    line: "Weak fit or not enough signal. Not worth campaign integration this cycle." };
}

// ── Sub-score calculators ──────────────────────────────────────────────────
function momentumScore(matched) {
  if (!matched.length) return 0;
  // Average lift of matched signals (lift is 30-95 from sources) → 0-100.
  const avgLift = matched.reduce((a, s) => a + (s.lift || 0), 0) / matched.length;
  return clamp((avgLift / 95) * 100);
}

function brandFitScore(matched, brand, persona) {
  if (!matched.length) return 0;
  const bw = BRAND_WEIGHTS[brandKey(brand)] || {};
  const pw = persona?.behavioural?.weights || {};
  // Average combined brand×persona weight across matched signals' lenses,
  // normalised (weight ~0.6–3.2 → 0-100, where 1.0 = neutral ≈ 50).
  let sum = 0;
  matched.forEach((s) => {
    const w = (bw[s.signal] || 1) * (pw[s.signal] || 1);
    sum += w;
  });
  const avgW = sum / matched.length;
  return clamp(((avgW - 0.4) / 2.6) * 100);
}

function timingScore(matched) {
  if (!matched.length) return 0;
  // Fresher = better window. Use median hours_ago; ≤6h = ~95, ≥168h = ~30.
  const ages = matched.map((s) => (s.hours_ago != null ? s.hours_ago : 24)).sort((a, b) => a - b);
  const median = ages[Math.floor(ages.length / 2)];
  return clamp(95 - median * 0.4);
}

function evidenceScore(matched) {
  if (!matched.length) return 0;
  const sources = new Set(matched.map((s) => s.source)).size;
  // Count contribution (up to ~15 signals) + source diversity (up to 4).
  const countPart = Math.min(1, matched.length / 12) * 60;
  const sourcePart = Math.min(1, sources / 4) * 40;
  return clamp(countPart + sourcePart);
}

function composite({ momentum, brand_fit, timing, evidence }) {
  return clamp(momentum * 0.35 + brand_fit * 0.30 + timing * 0.20 + evidence * 0.15);
}

// ── Core scorer ────────────────────────────────────────────────────────────
function scoreFromMatched(matched, brand, persona) {
  const breakdown = {
    momentum:  momentumScore(matched),
    brand_fit: brandFitScore(matched, brand, persona),
    timing:    timingScore(matched),
    evidence:  evidenceScore(matched),
  };
  const score = composite(breakdown);
  const verdict = verdictFor(score);
  return { score, verdict, breakdown };
}

// Score a Culture Drop theme: matched = the signals already clustered into it.
export function scoreTheme({ themeSignals, brand, persona }) {
  const r = scoreFromMatched(themeSignals || [], brand, persona);
  return {
    culture_score: r.score,
    verdict: r.verdict.label,
    verdict_tone: r.verdict.tone,
    recommendation: r.verdict.line,
    breakdown: r.breakdown,
  };
}

// ── Free-text query scorer (the "search Bhajan clubbing" flow) ──────────────
// Tokenise the query, match against the live signal pool by keyword overlap
// in query text + lens keywords, then score the matched set.
const STOP = new Set(["the","a","an","and","or","of","in","on","for","to","is","culture","trend","trends"]);

// Keyword → signal-lens hints so a query like "bhajan clubbing" maps to
// music_streaming + late_night_out even if no signal text literally matches.
const QUERY_LENS_HINTS = [
  [/bhajan|devotional|kirtan|temple|spiritual|sufi|qawwali/i, ["music_streaming", "cultural_explorer"]],
  [/club|rave|party|nightlife|techno|edm|dj|bar|pub|late.?night/i, ["late_night_out", "music_streaming"]],
  [/festival|concert|gig|tour|lineup/i, ["festivals"]],
  [/sneaker|streetwear|fashion|thrift|drip|outfit/i, ["fashion_sneakers", "social_identity"]],
  [/food|biryani|cafe|swiggy|zomato|restaurant|dining/i, ["food_delivery"]],
  [/cricket|ipl|match|stadium/i, ["cricket_watching"]],
  [/gaming|bgmi|esports|valorant/i, ["gaming_mobile"]],
  [/reel|insta|aesthetic|viral|meme|content/i, ["digital_expresser"]],
  [/indie|underground|discovery|emerging|niche/i, ["cultural_explorer", "music_streaming"]],
];

function lensesForQuery(q) {
  const out = new Set();
  for (const [re, lenses] of QUERY_LENS_HINTS) {
    if (re.test(q)) lenses.forEach((l) => out.add(l));
  }
  return [...out];
}

export function scoreQuery({ query, signals, brand, persona }) {
  const q = String(query || "").toLowerCase().trim();
  const tokens = q.split(/[^a-z0-9ऀ-ॿ஀-௿ঀ-৿]+/i)
    .filter((t) => t && t.length > 2 && !STOP.has(t));
  const hintedLenses = lensesForQuery(q);

  // Match signals by (a) token overlap in the signal's query text, or
  // (b) the signal's lens being one the query maps to.
  const matched = signals.filter((s) => {
    const text = (s.query || "").toLowerCase();
    const tokenHit = tokens.some((t) => text.includes(t));
    const lensHit = hintedLenses.includes(s.signal);
    return tokenHit || lensHit;
  });

  const r = scoreFromMatched(matched, brand, persona);

  // If almost nothing matched, it's a genuinely emerging/unproven idea —
  // be honest rather than inventing a score.
  const emerging = matched.length < 3;

  return {
    query,
    culture_score: emerging ? Math.min(r.score, 38) : r.score,
    verdict: emerging ? "Emerging / unproven" : r.verdict.label,
    verdict_tone: emerging ? "amber" : r.verdict.tone,
    recommendation: emerging
      ? `Only ${matched.length} live signal(s) relate to "${query}". It may be too early or too niche — treat as a bet, not a safe integration.`
      : r.verdict.line,
    breakdown: r.breakdown,
    matched_count: matched.length,
    matched_lenses: [...new Set(matched.map((s) => s.signal))],
    evidence: matched
      .sort((a, b) => (b.lift || 0) - (a.lift || 0))
      .slice(0, 6)
      .map((s) => ({ query: s.query, signal: s.signal, lift: s.lift, source: s.source, city: s.city, url: s.url || null })),
  };
}

// ── HTTP handler: GET /api/culture-score?q=...&brand=...&persona=... ─────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  try {
    const u = new URL(req.url || "/", "http://localhost");
    const query = u.searchParams.get("q") || "";
    const brand = u.searchParams.get("brand") || "Tuborg";
    const persona = getPersona(u.searchParams.get("persona") || "urban_gen_z");
    if (!query.trim()) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: false, error: "Provide ?q=<culture idea>" }));
    }
    const signals = await buildSignals();
    const result = scoreQuery({ query, signals, brand, persona });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, brand, persona: persona.key, ...result }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
}

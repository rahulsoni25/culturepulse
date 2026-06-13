// api/filters.js
// ──────────────────────────────────────────────────────────────────────────────
// SHARED FILTER LOGIC — Signal Lens + City reach
//
// Used by both /api/drops and /api/pulse-report so the same filter inputs
// reshape the entire framework consistently. Each filter degrades gracefully:
// if applying it would starve the pool below a usable floor, it falls back to
// the unfiltered set (the reviewer agent + evergreen backstop then handle any
// remaining thinness honestly).
// ──────────────────────────────────────────────────────────────────────────────

const POOL_FLOOR = 10; // below this, a filter falls back to unfiltered

// Signal Lens dropdown values → the SIG_META signal keys they include.
// Matches the frontend <select id="flens"> options exactly.
const LENS_MAP = {
  "0": null, // All signals — no filter
  "1": ["music_streaming", "festivals", "cultural_explorer"],                       // Music + festivals
  "2": ["gaming_mobile", "digital_expresser"],                                      // Gaming + tech
  "3": ["food_delivery", "late_night_out", "experience_maximiser", "group_socialiser", "escapist_micro"], // Food + lifestyle
  "4": ["fashion_sneakers", "social_identity", "digital_expresser"],                // Fashion + identity
};

export function applyLens(signals, lensVal) {
  const keys = LENS_MAP[String(lensVal)];
  if (!keys) return { signals, applied: false };
  const filtered = signals.filter((s) => keys.includes(s.signal));
  if (filtered.length >= POOL_FLOOR) return { signals: filtered, applied: true };
  return { signals, applied: false }; // graceful: too few, keep all
}

// City reach. Metros + national/global signals are the backbone; T1/T2 are
// the rest. National ("India"/"Global") signals always survive so the pool
// never collapses.
const METRO_RE = /\b(mumbai|delhi|delhi ncr|bangalore|bengaluru|blr|hyderabad|chennai|kolkata|pune|gurgaon|gurugram|noida|ahmedabad)\b/i;
const NATIONAL_RE = /\b(india|global|national)\b/i;

export function applyCity(signals, cityVal) {
  const v = String(cityVal);
  if (v === "1") {
    // Metro only (+ national)
    const f = signals.filter((s) => METRO_RE.test(s.city || "") || NATIONAL_RE.test(s.city || ""));
    return f.length >= POOL_FLOOR ? { signals: f, applied: true } : { signals, applied: false };
  }
  if (v === "2") {
    // T1 + T2 only (non-metro) + national
    const f = signals.filter((s) => !METRO_RE.test(s.city || "") || NATIONAL_RE.test(s.city || ""));
    return f.length >= POOL_FLOOR ? { signals: f, applied: true } : { signals, applied: false };
  }
  return { signals, applied: false }; // "Metro + T1 + T2" = everything
}

// ── Specific-city geo filter (location-based culture) ───────────────────────
// When a specific city is chosen (e.g. "mumbai"), keep signals from that city
// PLUS national/global signals (which apply everywhere). Lets each city
// surface its own cultural mix. Graceful fallback if a city is data-thin.
export function applyCityName(signals, cityName) {
  const c = String(cityName || "").toLowerCase().trim();
  if (!c || c === "all" || c === "india" || c === "all india") return { signals, applied: false };
  // city aliases
  const aliases = { bengaluru: "bangalore", blr: "bangalore", "delhi ncr": "delhi", gurugram: "delhi", gurgaon: "delhi", noida: "delhi" };
  const target = aliases[c] || c;
  const re = new RegExp("\\b(" + target + "|bengaluru|blr)\\b", "i");
  const f = signals.filter((s) => {
    const sc = (s.city || "").toLowerCase();
    return re.test(sc) || NATIONAL_RE.test(sc) || (target === "bangalore" && /\b(bangalore|bengaluru|blr)\b/i.test(sc));
  });
  return f.length >= POOL_FLOOR ? { signals: f, applied: true } : { signals, applied: false };
}

// ── Time window (ftime: 0=24h, 1=3d, 2=7d, 3=30d) ───────────────────────────
const TIME_HOURS = { "0": 24, "1": 72, "2": 168, "3": 720 };
export function applyTime(signals, timeVal) {
  const maxH = TIME_HOURS[String(timeVal)];
  if (!maxH || String(timeVal) === "3") return { signals, applied: false }; // 30d = effectively all
  const f = signals.filter((s) => (s.hours_ago == null ? 0 : s.hours_ago) <= maxH);
  return f.length >= POOL_FLOOR ? { signals: f, applied: true } : { signals, applied: false };
}

// ── Min confidence (fconf: 0=all, 1=≥0.70, 2=≥0.85, 3=≥0.90) ────────────────
const CONF_MIN = { "0": 0, "1": 0.70, "2": 0.85, "3": 0.90 };
export function applyConfidence(signals, confVal) {
  const min = CONF_MIN[String(confVal)] || 0;
  if (!min) return { signals, applied: false };
  const f = signals.filter((s) => (s.confidence || 0.8) >= min);
  return f.length >= POOL_FLOOR ? { signals: f, applied: true } : { signals, applied: false };
}

// ── Signal type (ftype: 0=all, 1=behaviour "doing", 2=feeling "perception") ─
// Lens → type map mirrors SIG_META.t in the frontend.
const LENS_TYPE = {
  music_streaming:"b", gaming_mobile:"b", food_delivery:"b", festivals:"b",
  travel_weekend:"b", fashion_sneakers:"b", cricket_watching:"b", late_night_out:"b",
  escapist_micro:"p", experience_maximiser:"p", social_identity:"p",
  digital_expresser:"p", group_socialiser:"p", cultural_explorer:"p",
};
export function applySignalType(signals, typeVal) {
  const v = String(typeVal);
  if (v !== "1" && v !== "2") return { signals, applied: false };
  const want = v === "1" ? "b" : "p";
  const f = signals.filter((s) => (LENS_TYPE[s.signal] || "b") === want);
  return f.length >= POOL_FLOOR ? { signals: f, applied: true } : { signals, applied: false };
}

// ── Drop threshold (fdrop: 0=any, 1=≥2× lift, 2=≥3×, 3=≥5× major) ───────────
// Live signal lift runs ~30-95; map the "×" thresholds onto that scale.
const DROP_MIN_LIFT = { "0": 0, "1": 55, "2": 68, "3": 80 };
export function applyDropThreshold(signals, dropVal) {
  const min = DROP_MIN_LIFT[String(dropVal)] || 0;
  if (!min) return { signals, applied: false };
  const f = signals.filter((s) => (s.lift || 0) >= min);
  return f.length >= POOL_FLOOR ? { signals: f, applied: true } : { signals, applied: false };
}

// ── Emphasis multipliers (SOFT) — Lens + Signal-type reshape ranking, they
// don't remove signals. This is the "combine" model: scope filters narrow the
// pool, emphasis filters re-prioritise within it — so stacking many filters
// never starves the output, and every filter still visibly changes the result.
export function lensMultiplier(signalKey, lensVal) {
  const keys = LENS_MAP[String(lensVal)];
  if (!keys) return 1;                       // "All signals"
  // Strong emphasis: when a lens is chosen, on-lens signals are boosted hard
  // and off-lens ones suppressed hard, so a Gaming ask isn't drowned by the
  // always-on music/trends sources.
  return keys.includes(signalKey) ? 3.0 : 0.25;
}
export function typeMultiplier(signalKey, typeVal) {
  const v = String(typeVal);
  if (v !== "1" && v !== "2") return 1;       // "All types"
  const want = v === "1" ? "b" : "p";
  return (LENS_TYPE[signalKey] || "b") === want ? 2.2 : 0.5;
}

// SCOPE filters (HARD) — Location, Time, Confidence, Drop genuinely narrow what
// is in scope. Each graceful. Lens + Signal-type are applied as emphasis in
// drops.js (not here). Territory is theme-level (also drops.js).
export function applyFilters(signals, { city, cityName, time, conf, drop } = {}) {
  const meta = { city_applied:false, time_applied:false, conf_applied:false, drop_applied:false };
  let out = signals;
  // Prefer specific-city filter when a city name is supplied; else tier filter.
  if (cityName != null && String(cityName).trim() && !/^all/i.test(String(cityName))) {
    const r = applyCityName(out, cityName); out = r.signals; meta.city_applied = r.applied;
  } else if (city != null) {
    const r = applyCity(out, city); out = r.signals; meta.city_applied = r.applied;
  }
  if (time != null) { const r = applyTime(out, time);          out = r.signals; meta.time_applied = r.applied; }
  if (conf != null) { const r = applyConfidence(out, conf);    out = r.signals; meta.conf_applied = r.applied; }
  if (drop != null) { const r = applyDropThreshold(out, drop); out = r.signals; meta.drop_applied = r.applied; }
  return { signals: out, meta };
}

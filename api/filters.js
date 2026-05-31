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

// Convenience: apply both, return signals + which filters actually took effect.
export function applyFilters(signals, { lens, city } = {}) {
  const meta = { lens_applied: false, city_applied: false };
  let out = signals;
  if (lens != null) {
    const r = applyLens(out, lens);
    out = r.signals; meta.lens_applied = r.applied;
  }
  if (city != null) {
    const r = applyCity(out, city);
    out = r.signals; meta.city_applied = r.applied;
  }
  return { signals: out, meta };
}

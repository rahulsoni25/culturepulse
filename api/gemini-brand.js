// api/gemini-brand.js
// ──────────────────────────────────────────────────────────────────────────────
// GEMINI BRAND PROFILER (key-gated)
//
// For ANY brand name we don't have a hand-built profile for, ask Gemini to
// infer its India cultural profile: lens weights + positioning + ideal
// partners + tone. This is the top inference layer in brands.js — it only
// fires when GEMINI_API_KEY is set and the keyword dictionary didn't already
// give a confident answer. Falls back silently (returns null) with no key or
// on any error, so the free keyword/signal path always still works.
//
// Get a free key: https://aistudio.google.com/apikey  → env GEMINI_API_KEY
//
// Uses Gemini 2.5 Flash with responseMimeType=application/json + a response
// schema, so output is always valid structured JSON (no prose parsing).
// ──────────────────────────────────────────────────────────────────────────────

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 8000;

const CORE_LENSES = [
  "music_streaming","festivals","late_night_out","food_delivery","gaming_mobile",
  "cricket_watching","fashion_sneakers","travel_weekend","digital_expresser","cultural_explorer",
];

// In-memory cache (per warm lambda) so we don't re-call Gemini for the same
// brand repeatedly. Keyed by normalised brand name.
const _cache = new Map();

export function geminiAvailable() {
  return !!process.env.GEMINI_API_KEY;
}

// JSON schema forcing Gemini to return exactly the shape we need.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    positioning:      { type: "STRING" },
    tone:             { type: "STRING" },
    delivery_partner: { type: "STRING" },
    music_partners:   { type: "STRING" },
    festival_play:    { type: "STRING" },
    weight: {
      type: "OBJECT",
      properties: Object.fromEntries(CORE_LENSES.map((l) => [l, { type: "NUMBER" }])),
    },
  },
  required: ["positioning", "tone", "weight"],
};

function buildPrompt(brand) {
  return `You are a senior brand-culture strategist working on the Indian market.
For the brand "${brand}", infer how strongly it should lean into each cultural lens
when planning marketing in India. Return ONLY JSON matching the schema.

The "weight" object must map EACH of these lenses to a number from 0.5 (avoid) to
2.0 (core territory), where 1.0 is neutral:
${CORE_LENSES.join(", ")}.

Also give:
- positioning: a short phrase, e.g. "premium international · F1/football · aspirational"
- tone: e.g. "youthful, music-first, never product-led"
- delivery_partner: the most fitting India delivery/commerce partner (or "n/a")
- music_partners: the kind of artists/creators that fit
- festival_play: the ideal festival/event activation in one phrase

Base it on the brand's real category, audience and positioning in India.`;
}

const clampW = (n) => Math.max(0.5, Math.min(2.0, Number(n) || 1));

export async function geminiBrandProfile(brand) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !brand) return null;
  const cacheKey = String(brand).toLowerCase().trim();
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(brand) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
        },
      }),
    });
    if (!r.ok) { _cache.set(cacheKey, null); return null; }
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) { _cache.set(cacheKey, null); return null; }
    const parsed = JSON.parse(text);

    // Normalise weights — ensure all 10 lenses present + clamped.
    const weight = {};
    CORE_LENSES.forEach((l) => (weight[l] = clampW(parsed.weight?.[l])));

    const profile = {
      name: brand,
      positioning: (parsed.positioning || "AI-inferred profile").slice(0, 80),
      weight,
      delivery_partner: parsed.delivery_partner || "delivery platform",
      music_partners: parsed.music_partners || "relevant creators",
      festival_play: parsed.festival_play || "Tier-2 activation",
      tone: parsed.tone || "neutral",
      inference_source: "gemini",
      inferred: true,
    };
    _cache.set(cacheKey, profile);
    return profile;
  } catch {
    _cache.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(t);
  }
}

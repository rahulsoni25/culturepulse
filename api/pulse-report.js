// api/pulse-report.js
// Weekly CulturePulse Pulse Report — the killer artifact a brand planner forwards.
//
// CURRENT MODE: mock-v1
//   - Pulls today's live signals from buildSignals() (same source as /api/signals)
//   - Templates planner-quality prose around the real data (top music signal,
//     top nightlife signal, top drop, etc.) so the brief feels written, not faked
//   - Returns the same JSON shape we'll use for the real LLM version
//
// SWAP TO GEMINI:
//   - Replace generateMockBrief() with a single call to Gemini 2.5 Flash
//     using the prompt template in buildPrompt() below
//   - Set GEMINI_API_KEY in Vercel env; bump model field to "gemini-2.5-flash"
//   - Everything else stays the same — the JSON contract, the frontend, caching
//
// Query params:
//   ?brand=Tuborg      (default: Tuborg)
//   ?age=16-22         (default: 16-22)
//   ?city=Metro+T1+T2  (default: Metro + T1 + T2)

import { buildSignals } from "./signals.js";
import { runFreshnessAgent } from "./agent-freshness.js";
import { runQualityAgent }   from "./agent-quality.js";
import { getPersona }        from "./personas.js";
import { applyFilters }      from "./filters.js";
import { inferBrandProfile } from "./brands.js";

// Map signal keys → human-readable cultural framing the mock uses to write prose.
// (When we swap in Gemini, this becomes context in the prompt, not output text.)
const SIGNAL_FRAMES = {
  music_streaming:  { theme: "music as identity",        verb: "streaming", artefact: "the playlist drop" },
  festivals:        { theme: "festival belonging",       verb: "showing up", artefact: "the pre-headliner moment" },
  late_night_out:   { theme: "the last-round ritual",    verb: "extending",  artefact: "'one more' permission" },
  food_delivery:    { theme: "late-night reward",        verb: "ordering",   artefact: "the 2am Swiggy ping" },
  gaming_mobile:    { theme: "the small-room escape",    verb: "playing",    artefact: "the controller + drink combo" },
  cricket_watching: { theme: "the room, not the stadium",verb: "gathering",  artefact: "the watch-party roar" },
  fashion_sneakers: { theme: "objects as signal",        verb: "unboxing",   artefact: "the limited drop" },
  travel_weekend:   { theme: "last-minute escape",       verb: "deciding",   artefact: "the Friday night plan" },
  digital_expresser:{ theme: "curated self",             verb: "posting",    artefact: "the format" },
  cultural_explorer:{ theme: "discovery before hype",    verb: "finding",    artefact: "before everyone else" },
};

// Brand profiles now come from the canonical inference engine (brands.js),
// which resolves the 4 known brands AND any free-text brand/keyword input.
// getBrandProfile is a thin wrapper kept for call-site compatibility.
function getBrandProfile(brandName, signals = null) {
  return inferBrandProfile(brandName, signals);
}

function pickTop(signals, signalKey, n = 1) {
  return signals
    .filter((s) => s.signal === signalKey)
    .sort((a, b) => (b.lift || 0) - (a.lift || 0))
    .slice(0, n);
}

function summarise(s) {
  if (!s) return null;
  const q = (s.query || "").replace(/\s+/g, " ").slice(0, 90);
  return { query: q, lift: s.lift, source: s.source, city: s.city, url: s.url || null };
}

// ── Mock brief generator ─────────────────────────────────────────────────────
// Writes planner-quality prose that templates against the actual live data,
// so it never reads as generic boilerplate.
function generateMockBrief({ brand, age, city, signals, profile, persona }) {
  // Apply BRAND × PERSONA weighting to the signal pool — each signal's score
  // is its lift times the brand's lens weight times the persona's lens weight,
  // so the strongest cultural lens for THIS brand AND THIS audience surfaces.
  const pw = persona?.behavioural?.weights || {};
  const weighted = signals.map((s) => ({
    ...s,
    brandScore: (s.lift || 0)
      * ((profile.weight && profile.weight[s.signal]) || 1)
      * (pw[s.signal] || 1),
  }));

  const topMusic   = pickTop(weighted, "music_streaming", 2);
  const topNight   = pickTop(weighted, "late_night_out", 2);
  const topFest    = pickTop(weighted, "festivals", 1);
  const topGaming  = pickTop(weighted, "gaming_mobile", 1);
  const topFood    = pickTop(weighted, "food_delivery", 1);
  const topCricket = pickTop(weighted, "cricket_watching", 1);

  // Pick the strongest cultural moment FOR THIS BRAND (weighted), not just
  // the strongest signal globally.
  const all = weighted.slice().sort((a, b) => b.brandScore - a.brandScore);
  const lead = all.find((s) => s.signal !== "cultural_explorer") || all[0];
  const leadFrame = SIGNAL_FRAMES[lead?.signal] || SIGNAL_FRAMES.cultural_explorer;

  const counts = {
    music: signals.filter((s) => s.signal === "music_streaming").length,
    night: signals.filter((s) => s.signal === "late_night_out").length,
    fest:  signals.filter((s) => s.signal === "festivals").length,
    food:  signals.filter((s) => s.signal === "food_delivery").length,
    total: signals.length,
  };

  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  const headline =
    topMusic[0]
      ? `${brand}, ${age}: ${leadFrame.theme} is the open brief this week`
      : `${brand}, ${age}: cultural attention is fragmenting — pick one lens`;

  const p1 =
    `This week's signal feed for ${brand} (${age}, ${city}) pulled ${counts.total} live ` +
    `cultural data points — Google Trends rising queries, Google News India coverage. ` +
    `The strongest current is ${leadFrame.theme}. ` +
    (topMusic[0]
      ? `${counts.music} music signals surfaced, led by "${summarise(topMusic[0]).query}" ` +
        `(${topMusic[0].lift}× over baseline). `
      : "") +
    (topNight[0]
      ? `Nightlife discourse is active — "${summarise(topNight[0]).query}" is the conversation, ` +
        `not the venue. `
      : "") +
    `Read the audience as ${leadFrame.verb}, not consuming.`;

  // P2 — brand-aware gap analysis. Picks the lens that THIS brand should care
  // about based on its weight profile.
  const brandTopLens = lead.signal;
  const isCricketBrand = (profile.weight?.cricket_watching || 1) >= 1.8;
  const p2 =
    isCricketBrand && topCricket[0]
      ? `Cricket is non-negotiable for ${brand}: "${summarise(topCricket[0]).query}" is the conversation, ` +
        `and ${brand}'s positioning ("${profile.positioning}") puts you closer to the watch-party ritual than any competitor. ` +
        `The opening is to own the room, not the broadcast — ${profile.festival_play}.`
      : topFest[0]
      ? `Festival culture is the highest-leverage adjacency for ${brand}: ` +
        `"${summarise(topFest[0]).query}" carries ${topFest[0].lift}× lift, and ` +
        `${brand} is structurally absent from the pre-headliner window. ` +
        `${profile.festival_play} is the under-owned move — that 90-minute window is where ` +
        `purchase decisions get made for the night.`
      : topGaming[0] && (profile.weight?.gaming_mobile || 1) >= 1
      ? `Gaming + late-night is converging and no beer brand owns it. ` +
        `"${summarise(topGaming[0]).query}" surfaced alongside ${counts.night} nightlife signals — ` +
        `the 10pm gaming + food delivery + drink combo fits ${brand}'s "${profile.positioning}" cleanly.`
      : `${brand} is structurally absent from the strongest cultural moment for its audience. ` +
        `Profile says: ${profile.positioning}. The gap is ${leadFrame.theme}.`;

  const p3 =
    `Culture Fit for ${brand} this cycle: holding, but the gap is in ${leadFrame.theme}. ` +
    `Recommend seeding through ${profile.music_partners} before scaling paid. ` +
    `Tone: ${profile.tone}. ` +
    `Lead with ${leadFrame.artefact} — the moment, not the bottle.`;

  // Action priority follows the lead lens — first action should match the
  // brand's strongest signal type, not always default to music.
  const actOn = [];

  // Act #1: anchored on the lead lens
  if (isCricketBrand && topCricket[0]) {
    actOn.push(
      `Anchor next cycle on "${summarise(topCricket[0]).query.slice(0, 80)}" — ` +
      `3 city-specific watch-party creators, IPL fixture-aligned drops. ${profile.festival_play}.`
    );
  } else if (topFest[0] && topMusic[0]) {
    actOn.push(
      `Partner with a ${topMusic[0].city || "Mumbai"}-based artist 2 weeks before ` +
      `"${summarise(topFest[0]).query.slice(0, 80)}" — ` +
      `pre-festival ${profile.tone.includes("premium") ? "co-branded playlist" : "playlist drop"}, not on-stage.`
    );
  } else if (topMusic[0]) {
    actOn.push(
      `Seed "${summarise(topMusic[0]).query.slice(0, 80)}" via ${profile.music_partners}. ` +
      `Co-create a playlist, not a sponsorship.`
    );
  } else {
    actOn.push(
      `Pivot creator strategy toward ${leadFrame.theme} — currently under-indexed vs audience pull.`
    );
  }

  // Act #2: nightlife / ritual moment (or fallback)
  if (topNight[0]) {
    actOn.push(
      `Own the "${leadFrame.artefact}" moment: pilot 2 city-specific Reels ` +
      `(${topNight[0].city}, then second metro). 48hr turnaround.`
    );
  } else {
    actOn.push(`Define the ${leadFrame.theme} ritual moment for ${brand}. Currently no one owns it.`);
  }

  // Act #3: commerce / activation lever
  if (topFood[0]) {
    actOn.push(`Test a ${profile.delivery_partner} × ${brand} bundle for late-night orders — 2-week pilot in one metro.`);
  } else if (isCricketBrand) {
    actOn.push(`${profile.festival_play} — submit brief for the next match cycle (Mumbai or Chennai before Delhi).`);
  } else if (counts.fest > 0) {
    actOn.push(`${profile.festival_play} — submit a brief for the next festival cycle (Pune or BLR before Mumbai).`);
  } else {
    actOn.push(`Run a sharper signal pull next week — current lens may be miscalibrated.`);
  }

  return {
    headline,
    paragraphs: [p1, p2, p3],
    actOn,
    citations: [topMusic[0], topNight[0], topFest[0], topGaming[0], topFood[0], topCricket[0]]
      .filter(Boolean)
      .map((s) => ({ query: summarise(s).query, signal: s.signal, lift: s.lift, source: s.source })),
    date: dateStr,
    counts,
  };
}

// ── Prompt template (used when we swap to Gemini) ────────────────────────────
// Keep this exported / inspectable so future-us can iterate the prompt before
// flipping the switch. Not wired into anything yet.
export function buildPrompt({ brand, age, city, signals }) {
  const top = signals.slice(0, 25).map((s, i) =>
    `${i+1}. [${s.signal}] ${s.query} — ${s.lift}× · ${s.city} · ${s.source}`
  ).join("\n");
  return `You are a senior brand planner writing a weekly culture brief for ${brand}.
Audience: ${age}, ${city}. Tone: opinionated, short sentences, planner shorthand, no jargon.

Live signals captured this week (sorted by lift):
${top}

Write:
1. One headline (under 12 words)
2. Three paragraphs (≤80 words each):
   • P1: what the data actually says about the audience this week
   • P2: where ${brand} is structurally absent — the gap, not the opportunity
   • P3: a clear creative direction in the form "Lead with X, not Y"
3. Three "Act on this" bullets — specific, costed, time-bound

Do not say "in conclusion." Do not list every signal. Pick the 2-3 that matter and write from there.`;
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  try {
    // Parse query params — works for both Node-style req and Web Request.
    const urlStr = req.url || "/";
    const u = new URL(urlStr, "http://localhost");
    // Title-case the brand so prose reads naturally even if the frontend passes
    // a lowercase input value.
    const rawBrand = (u.searchParams.get("brand") || "Tuborg").trim();
    const brand = rawBrand
      .split(/\s+/)
      .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
      .join(" ");
    const age   = u.searchParams.get("age")   || "16–22 Late Gen Z";
    const city  = u.searchParams.get("city")  || "Metro + T1 + T2";
    // Persona (audience) + Signal-Lens + City-reach filters so the brief
    // reshapes with the same inputs as the rest of the framework.
    const personaKey = u.searchParams.get("persona") || "urban_gen_z";
    const persona = getPersona(personaKey);
    const lensVal = u.searchParams.get("lens");   // "0".."4"
    const cityVal = u.searchParams.get("cityVal"); // "0".."2" (numeric filter, separate from display label)

    const allSignals = await buildSignals();
    const { signals, meta: filterMeta } = applyFilters(allSignals, { lens: lensVal, city: cityVal });
    const profile = getBrandProfile(brand, signals);
    const rawBrief = generateMockBrief({ brand: profile.name, age, city, signals, profile, persona });

    // ── REVIEW PIPELINE ─────────────────────────────────────────────────────
    // Two agents run on every brief before it goes out:
    //   1. Freshness agent: audits the underlying signals (recency, diversity, volume)
    //   2. Quality agent: audits the prose (grammar, claims-vs-stats, structure)
    //      and AUTO-FIXES mechanical issues (double spaces, brand-case drift).
    //
    // The quality agent's fixed brief replaces the raw one. Both verdicts
    // get shipped in the response under `review`, so the frontend can render
    // a Trust panel and the user can see what was checked and what was fixed.
    const generated_at = new Date().toISOString();
    const briefWithMeta = { ...rawBrief, generated_at };
    const freshness = runFreshnessAgent({ signals, brief: briefWithMeta });
    const quality   = runQualityAgent({ brief: briefWithMeta, signals, brand: profile.name });
    const brief     = quality.fixed_brief;

    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      model: "mock-v1",
      brand: profile.name,
      brand_profile: { positioning: profile.positioning, tone: profile.tone },
      persona: { key: persona.key, name: persona.name },
      age, city,
      filters: { lens: lensVal, city: cityVal, lens_applied: filterMeta.lens_applied, city_applied: filterMeta.city_applied },
      generated_at,
      ...brief,
      review: { freshness, quality: quality.verdict },
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
}

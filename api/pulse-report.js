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

// Brand profiles — drive signal weighting + tactical suggestions. Adding a
// new brand = adding an entry here; the prose adapts automatically.
const BRAND_PROFILES = {
  tuborg: {
    name: "Tuborg",
    positioning: "challenger lager · youth · music-led",
    weight: { music_streaming:1.6, festivals:1.5, late_night_out:1.4, food_delivery:1.2, gaming_mobile:1.1, fashion_sneakers:1.0, cricket_watching:0.7, digital_expresser:1.1, travel_weekend:1.0, cultural_explorer:1.1 },
    delivery_partner: "Zomato",
    music_partners: "rising indie / hip-hop artists (50K–500K)",
    festival_play: "Tier-2 stage activation · pre-headliner window",
    tone: "youthful, music-first, never product-led",
  },
  heineken: {
    name: "Heineken",
    positioning: "premium international · F1/football · aspirational",
    weight: { music_streaming:1.2, festivals:1.3, late_night_out:1.5, fashion_sneakers:1.4, travel_weekend:1.3, cricket_watching:0.9, food_delivery:1.0, gaming_mobile:1.0, digital_expresser:1.1, cultural_explorer:1.2 },
    delivery_partner: "Swiggy Instamart (premium SKU)",
    music_partners: "internationally-touring artists, EDM circuits",
    festival_play: "headline-sponsor positioning · F1 GP weekends",
    tone: "premium, globally connected, restrained",
  },
  kingfisher: {
    name: "Kingfisher",
    positioning: "mass-market lager · cricket-anchored · Indian heritage",
    weight: { cricket_watching:2.0, food_delivery:1.4, festivals:1.1, late_night_out:1.1, music_streaming:1.0, gaming_mobile:0.9, fashion_sneakers:0.7, travel_weekend:1.2, digital_expresser:0.9, cultural_explorer:0.9 },
    delivery_partner: "Swiggy",
    music_partners: "mass-market Bollywood playback artists",
    festival_play: "IPL match-day activation · viewing parties",
    tone: "warm, mass, cricket-anchored",
  },
  bira: {
    name: "Bira91",
    positioning: "craft challenger · urban Gen-Z · design-led",
    weight: { fashion_sneakers:1.7, music_streaming:1.4, festivals:1.3, digital_expresser:1.5, food_delivery:1.2, late_night_out:1.3, gaming_mobile:1.0, cricket_watching:0.6, travel_weekend:1.1, cultural_explorer:1.3 },
    delivery_partner: "Zomato + Swiggy (craft SKU placement)",
    music_partners: "indie-electronica, alt-hip-hop, Spotify-native artists",
    festival_play: "boutique festival presence · branded merch capsule",
    tone: "design-forward, ironic, urban",
  },
};

function getBrandProfile(brandName) {
  const raw = String(brandName || "").toLowerCase();
  const key = raw.replace(/[^a-z0-9]/g, "");      // "bira91", "tuborg"
  const lettersOnly = raw.replace(/[^a-z]/g, ""); // "bira", "tuborg"
  if (BRAND_PROFILES[key]) return BRAND_PROFILES[key];
  if (BRAND_PROFILES[lettersOnly]) return BRAND_PROFILES[lettersOnly];
  // Custom/unknown brand → use a generic challenger profile but keep the brand name.
  return {
    name: brandName,
    positioning: "[brand profile not on file — using youth-challenger defaults]",
    weight: { music_streaming:1.3, festivals:1.2, late_night_out:1.2, food_delivery:1.1, gaming_mobile:1.0, fashion_sneakers:1.1, cricket_watching:1.0, digital_expresser:1.1, travel_weekend:1.0, cultural_explorer:1.1 },
    delivery_partner: "delivery platform",
    music_partners: "mid-tier creators (50K–200K)",
    festival_play: "Tier-2 stage activation",
    tone: "neutral",
  };
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
function generateMockBrief({ brand, age, city, signals, profile }) {
  // Apply brand weighting to the signal pool — each signal gets a brand-adjusted
  // score so the strongest cultural lens for THIS brand surfaces, not just the
  // strongest globally.
  const weighted = signals.map((s) => ({
    ...s,
    brandScore: (s.lift || 0) * ((profile.weight && profile.weight[s.signal]) || 1),
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

    const signals = await buildSignals();
    const profile = getBrandProfile(brand);
    const brief = generateMockBrief({ brand: profile.name, age, city, signals, profile });

    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      model: "mock-v1",
      brand: profile.name,
      brand_profile: { positioning: profile.positioning, tone: profile.tone },
      age, city,
      generated_at: new Date().toISOString(),
      ...brief,
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
}

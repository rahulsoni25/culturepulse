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
function generateMockBrief({ brand, age, city, signals }) {
  const topMusic   = pickTop(signals, "music_streaming", 2);
  const topNight   = pickTop(signals, "late_night_out", 2);
  const topFest    = pickTop(signals, "festivals", 1);
  const topGaming  = pickTop(signals, "gaming_mobile", 1);
  const topFood    = pickTop(signals, "food_delivery", 1);
  const topCricket = pickTop(signals, "cricket_watching", 1);

  // Pick the strongest cultural moment from across the lenses.
  const all = signals.slice().sort((a, b) => (b.lift || 0) - (a.lift || 0));
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

  const p2 =
    topFest[0]
      ? `Festival culture is the highest-leverage adjacency: ` +
        `"${summarise(topFest[0]).query}" carries ${topFest[0].lift}× lift, and ` +
        `${brand} is structurally absent from the 90-minute pre-headliner window. ` +
        `That window is where beer purchase decisions get made for the night — ` +
        `it's currently owned by no brand, and the cost-to-own is one Tier-2 stage activation.`
      : topGaming[0]
      ? `Gaming + late-night is the converging signal nobody is claiming. ` +
        `"${summarise(topGaming[0]).query}" surfaced this week alongside ${counts.night} nightlife signals — ` +
        `the 10pm gaming + food delivery + drink combo is a Tuborg moment hiding in plain sight.`
      : `${brand} is structurally absent from the strongest cultural moment surfaced this week. ` +
        `That gap is the open brief.`;

  const p3 =
    `Culture Fit for ${brand} this cycle: holding, but the gap is in ${leadFrame.theme}. ` +
    `Recommend seeding through 3-5 creators in that space before scaling paid. ` +
    `Don't lead with the product. ` +
    `Lead with ${leadFrame.artefact} — the moment, not the bottle.`;

  const actOn = [
    topFest[0] && topMusic[0]
      ? `Partner with a ${topMusic[0].city || "Mumbai"}-based artist 2 weeks before "${summarise(topFest[0]).query}" — pre-festival playlist drop, not on-stage.`
      : topMusic[0]
      ? `Seed "${summarise(topMusic[0]).query}" via 3 mid-tier music creators (50K–200K). Co-create a playlist, not a sponsorship.`
      : `Pivot creator strategy toward music — currently under-indexed vs audience pull.`,
    topNight[0]
      ? `Own the "one more" moment: pilot 2 city-specific Reels concepts (${topNight[0].city}, then second metro) around the last-round social ritual. 48hr turnaround.`
      : `Define the late-night ritual moment for ${brand}. Currently no one owns it.`,
    topFood[0]
      ? `Test a ${summarise(topFood[0]).query.includes("swiggy") ? "Swiggy" : "Zomato"} x ${brand} bundle for late-night orders — 2-week pilot in one metro.`
      : counts.fest > 0
      ? `Submit a Tier-2 stage activation brief for the next festival cycle — Pune or BLR before Mumbai.`
      : `Run a sharper signal pull next week — current lens may be miscalibrated.`,
  ];

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
    const brief = generateMockBrief({ brand, age, city, signals });

    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      model: "mock-v1",
      brand, age, city,
      generated_at: new Date().toISOString(),
      ...brief,
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
}

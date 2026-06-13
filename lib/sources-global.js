// api/sources-global.js
// ──────────────────────────────────────────────────────────────────────────────
// GLOBAL CULTURAL CROSS-CUT
//
// Two free, no-key sources for global culture context:
//   • Mastodon trending hashtags — diaspora + global Gen Z signal
//   • MusicBrainz event search — structured music event data with India filter
//
// These don't dominate the brief; they provide cross-cut intelligence so
// the India-focused output has a "what's globally hot right now" anchor.
// Useful for spotting trends that diaspora is bringing back home.
// ──────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 5000;
const UA = "culturepulse/0.3 (+https://culturepulse-seven.vercel.app)";

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

// ── MASTODON TRENDING TAGS ──────────────────────────────────────────────────
// Free public API; mstdn.social is a large general-purpose instance.
// Trending hashtags reflect global Gen Z / digital-culture conversation.
// Tag → lens mapping is keyword-based.
const MASTODON_INSTANCE = "https://mstdn.social";

function classifyMastodonTag(tag) {
  const t = String(tag || "").toLowerCase();
  if (/music|song|album|spotify|hiphop|rap|indie|edm/.test(t)) return "music_streaming";
  if (/festival|gig|tour|concert/.test(t)) return "festivals";
  if (/food|cuisine|restaurant/.test(t)) return "food_delivery";
  if (/cricket|ipl|football|soccer/.test(t)) return "cricket_watching";
  if (/gaming|esports|valorant|bgmi|playstation|xbox/.test(t)) return "gaming_mobile";
  if (/sneaker|fashion|streetwear|outfit/.test(t)) return "fashion_sneakers";
  if (/nightlife|club|bar|pub/.test(t)) return "late_night_out";
  if (/travel|trip|getaway|adventure/.test(t)) return "travel_weekend";
  if (/aesthetic|reel|insta|tiktok|viral/.test(t)) return "digital_expresser";
  return "cultural_explorer";
}

export async function fetchMastodonTrending() {
  try {
    const r = await fetchWithTimeout(`${MASTODON_INSTANCE}/api/v1/trends/tags?limit=20`);
    if (!r.ok) return [];
    const tags = await r.json();
    if (!Array.isArray(tags)) return [];
    return tags.slice(0, 10).map((t) => {
      // Mastodon trends provide a "history" array with per-day usage counts;
      // the most recent day's "uses" → lift (log-normalised).
      const recentUses = parseInt(t?.history?.[0]?.uses || "0", 10);
      const lift = Math.min(80, Math.max(35, Math.round(30 + Math.log10(recentUses + 5) * 12)));
      return {
        query: `#${t.name}`,
        cat: "Mastodon trending",
        lift,
        signal: classifyMastodonTag(t.name),
        city: "Global",
        source: "mastodon",
        url: t.url,
        recent_uses: recentUses,
      };
    });
  } catch {
    return [];
  }
}

// ── MUSICBRAINZ EVENTS (India) ──────────────────────────────────────────────
// Structured music-event database. Free, no key. Returns concerts /
// festivals / tour stops with country filter.
export async function fetchMusicBrainzIndia() {
  try {
    const url =
      "https://musicbrainz.org/ws/2/event?query=country:IN&fmt=json&limit=8";
    const r = await fetchWithTimeout(url);
    if (!r.ok) return [];
    const j = await r.json();
    const events = j?.events || [];
    const out = [];
    for (const e of events.slice(0, 6)) {
      const name = (e.name || "").trim();
      if (!name) continue;
      const lifespan = e["life-span"]?.begin || null;
      // We can't easily compute recency for MusicBrainz events because the
      // dates are historical/festival ranges; keep lift moderate so they
      // don't dominate the feed but still surface.
      out.push({
        query: name.slice(0, 140),
        cat: "MusicBrainz event",
        lift: 55,
        signal: name.match(/festival|fest|carnival/i) ? "festivals" : "music_streaming",
        city: e?.place?.name || "India",
        source: "musicbrainz",
        url: `https://musicbrainz.org/event/${e.id}`,
        date: lifespan,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// api/sources-extra.js
// ──────────────────────────────────────────────────────────────────────────────
// EXPANDABLE SIGNAL SOURCES
//
// These are sources that we DON'T fetch on every run — only when the
// Reviewer Agent decides the default pool is too thin and emits an
// "enable_extra_sources" action. Keeping them opt-in keeps the default
// fast and the agent's "I just added Hacker News" trail honest.
//
// Sources here:
//   • hackernews — top stories from HN Algolia (cross-cut digital culture)
//   • extra_news_queries — additional Google News queries for thin themes
//
// Each fetcher returns the same { query, lift, signal, source, ... } shape
// used everywhere else, so signals.js can fold them in transparently.
// ──────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 4000;

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "culturepulse/0.2 (https://culturepulse-seven.vercel.app)",
        "Accept": "application/json, text/xml, */*",
        ...(opts.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

// ── Hacker News (Algolia API — fast, free, no key) ──────────────────────────
// Returns top India-relevant stories from the past 24h. Skews tech/digital,
// useful for the "digital_expresser" and "cultural_explorer" lenses.
export async function fetchHackerNews() {
  try {
    // Search front-page-ranked stories that mention India or Indian topics.
    const url = "https://hn.algolia.com/api/v1/search?tags=story&query=india&numericFilters=points%3E10,created_at_i%3E" +
      Math.floor((Date.now() - 7 * 24 * 36e5) / 1000);
    const r = await fetchWithTimeout(url);
    if (!r.ok) return [];
    const j = await r.json();
    const hits = j?.hits || [];
    const items = [];
    for (const h of hits.slice(0, 8)) {
      const title = (h.title || "").trim();
      if (!title) continue;
      // Drop pure-tech HN items with no Indian cultural angle.
      if (!/india|indian|mumbai|delhi|bangalore|bengaluru|chennai|kolkata|hyderabad|pune|desi|bollywood/i.test(title)) continue;
      const points = h.points || 0;
      const hoursAgo = h.created_at_i ? Math.max(0, (Date.now() / 1000 - h.created_at_i) / 3600) : 24;
      if (hoursAgo > 24 * 7) continue;
      // Score: log-scale points + recency.
      const lift = Math.min(85, Math.max(35, Math.round(35 + Math.log10(points + 5) * 12 - hoursAgo * 0.3)));
      // HN classification — most India-on-HN content is tech/digital culture.
      const signal = /music|festival|food|cricket|gaming|sneaker|nightlife/i.test(title)
        ? classifyHnTitle(title)
        : "digital_expresser";
      items.push({
        query: title.slice(0, 140),
        cat: "Hacker News",
        lift,
        signal,
        city: "India",
        source: "hn",
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        points,
        hours_ago: Math.round(hoursAgo),
      });
    }
    return items;
  } catch {
    return [];
  }
}

function classifyHnTitle(t) {
  if (/festival/i.test(t)) return "festivals";
  if (/music|spotify/i.test(t)) return "music_streaming";
  if (/food|swiggy|zomato/i.test(t)) return "food_delivery";
  if (/cricket|ipl/i.test(t)) return "cricket_watching";
  if (/gaming|esports|bgmi/i.test(t)) return "gaming_mobile";
  if (/sneaker|streetwear|fashion/i.test(t)) return "fashion_sneakers";
  if (/nightlife|club|bar/i.test(t)) return "late_night_out";
  return "cultural_explorer";
}

// ── Extra Google News queries (used when themes are thin) ───────────────────
// Same shape as the default NEWS_QUERIES in signals.js. The reviewer agent
// emits which extra topics to add via its expand_news_queries action.
export const EXTRA_NEWS_QUERIES_MAP = {
  intimate_gatherings: [
    { q: 'board game cafe india OR house party india', signal: "late_night_out",  city: "Mumbai", cat: "Lifestyle" },
    { q: 'listening party india OR home theatre india', signal: "group_socialiser", city: "Mumbai", cat: "Lifestyle" },
  ],
  music_belonging: [
    { q: 'indian indie band OR independent music india', signal: "music_streaming", city: "Mumbai", cat: "Music" },
    { q: 'spotify india artist OR new song india',       signal: "music_streaming", city: "Mumbai", cat: "Music" },
  ],
  discovery_culture: [
    { q: 'underground music scene india OR indie discovery india', signal: "cultural_explorer", city: "BLR",    cat: "Discovery" },
    { q: 'before they blow up india OR rising artist india',       signal: "cultural_explorer", city: "Mumbai", cat: "Discovery" },
  ],
  performance_relief: [
    { q: 'gen z burnout india OR mental wellness india',  signal: "escapist_micro",  city: "Mumbai", cat: "Wellness" },
    { q: 'work life balance india OR switch off india',   signal: "escapist_micro",  city: "BLR",    cat: "Wellness" },
  ],
  scene_individual: [
    { q: 'indian subculture OR niche scene india',        signal: "social_identity", city: "Mumbai", cat: "Identity" },
  ],
  festival_culture: [
    { q: 'india music festival 2026 OR side stage india', signal: "festivals",       city: "Pune",   cat: "Festivals" },
    { q: 'magnetic fields festival OR ziro festival',     signal: "festivals",       city: "Goa",    cat: "Festivals" },
  ],
  curated_real: [
    { q: 'aesthetic reel india OR low fi content india',  signal: "digital_expresser", city: "Mumbai", cat: "Content" },
  ],
  fomo_genuine: [
    { q: 'fomo india OR authentic experience india',      signal: "experience_maximiser", city: "Mumbai", cat: "Experience" },
  ],
  cricket_culture: [
    { q: 'ipl watch party india OR cricket fan',          signal: "cricket_watching", city: "Mumbai", cat: "Sports" },
  ],
};

// Given an array of theme keys we need to deepen, return the additional
// query specs to feed into fetchNews().
export function extraQueriesForThemes(themeKeys) {
  const out = [];
  for (const k of themeKeys) {
    (EXTRA_NEWS_QUERIES_MAP[k] || []).forEach((q) => out.push(q));
  }
  return out;
}

// Given an array of arbitrary query strings (from the reviewer's
// expand_news_queries action), return query specs the news fetcher accepts.
// Each becomes a news search at default settings.
export function adhocQueries(strings) {
  return (strings || []).map((q) => ({
    q,
    signal: "cultural_explorer",
    city:   "India",
    cat:    "Adhoc",
  }));
}

// api/sources-apple.js
// ──────────────────────────────────────────────────────────────────────────────
// APPLE / iTunes RSS — India charts (free, no key)
//
// Apple exposes country-specific "top" RSS feeds with zero auth. These are
// some of the highest-fidelity behavioural signals available free:
//
//   • Top Songs India       → what India is actually buying/streaming (music_streaming)
//   • Top Free Apps India    → behavioural truth: Rapido, Blinkit, JioHotstar,
//                              ChatGPT, gaming apps reveal how India lives now
//   • Podcasts (India query) → discovery/cultural-explorer signal
//
// The app-store chart is a sleeper signal nobody in culture-intel uses: app
// rank movements reveal behaviour shifts before they hit news. A grocery app
// climbing = convenience-culture shift; a gaming app spiking = a new tribe.
// ──────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 5000;
const UA = "culturepulse/0.4 (+https://culturepulse-seven.vercel.app)";

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": UA, "Accept": "application/json", ...(opts.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

// ── TOP SONGS INDIA ─────────────────────────────────────────────────────────
// Chart position drives lift: #1 = highest. Always music_streaming lens.
async function fetchAppleTopSongs() {
  try {
    const r = await fetchWithTimeout("https://itunes.apple.com/in/rss/topsongs/limit=15/json");
    if (!r.ok) return [];
    const j = await r.json();
    const entries = j?.feed?.entry || [];
    return entries.slice(0, 10).map((e, i) => {
      const name = e["im:name"]?.label || "";
      const artist = e["im:artist"]?.label || "";
      // Rank 0 (top) → lift 88; rank 9 → lift ~58. Chart-toppers matter most.
      const lift = Math.max(55, 88 - i * 3);
      return {
        query: `${name} — ${artist}`.slice(0, 140),
        cat: "Apple Top Songs IN",
        lift,
        signal: "music_streaming",
        city: "India",
        source: "apple_music",
        rank: i + 1,
        url: e.link?.attributes?.href || null,
        hours_ago: 0, // charts are current
      };
    });
  } catch {
    return [];
  }
}

// ── TOP FREE APPS INDIA ───────────────────────────────────────────────────────
// App-category → signal lens. This is the behavioural-truth source.
const APP_CATEGORY_LENS = {
  "Food & Drink":     "food_delivery",
  "Music":            "music_streaming",
  "Games":            "gaming_mobile",
  "Entertainment":    "digital_expresser",
  "Photo & Video":    "digital_expresser",
  "Social Networking":"social_identity",
  "Travel":           "travel_weekend",
  "Sports":           "cricket_watching",
  "Shopping":         "fashion_sneakers",
  "Lifestyle":        "experience_maximiser",
};

function classifyApp(categoryLabel, appName) {
  if (APP_CATEGORY_LENS[categoryLabel]) return APP_CATEGORY_LENS[categoryLabel];
  const n = String(appName || "").toLowerCase();
  if (/swiggy|zomato|blinkit|zepto|instamart|eat/.test(n)) return "food_delivery";
  if (/spotify|gaana|wynk|saavn|music/.test(n)) return "music_streaming";
  if (/bgmi|game|ludo|chess|battle/.test(n)) return "gaming_mobile";
  if (/hotstar|netflix|prime|sony|zee|ott/.test(n)) return "digital_expresser";
  if (/insta|snap|reels|moj|sharechat/.test(n)) return "social_identity";
  if (/rapido|uber|ola|ixigo|makemytrip/.test(n)) return "travel_weekend";
  return "cultural_explorer";
}

async function fetchAppleTopApps() {
  try {
    const r = await fetchWithTimeout("https://itunes.apple.com/in/rss/topfreeapplications/limit=20/json");
    if (!r.ok) return [];
    const j = await r.json();
    const entries = j?.feed?.entry || [];
    const out = [];
    for (let i = 0; i < entries.length && out.length < 10; i++) {
      const e = entries[i];
      const name = e["im:name"]?.label || "";
      const category = e.category?.attributes?.label || "";
      if (!name) continue;
      const lens = classifyApp(category, name);
      // Only surface apps that map to a cultural lens (skip utilities/finance
      // that aren't behavioural-culture signals).
      if (lens === "cultural_explorer" && /aadhaar|paytm|phonepe|gpay|bank|sbi/i.test(name)) continue;
      const lift = Math.max(50, 82 - i * 2);
      out.push({
        query: `${name} trending in India app charts (${category})`.slice(0, 140),
        cat: "Apple Top Apps IN",
        lift,
        signal: lens,
        city: "India",
        source: "apple_apps",
        rank: i + 1,
        app_category: category,
        url: e.link?.attributes?.href || null,
        hours_ago: 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── PODCASTS (India) ──────────────────────────────────────────────────────────
async function fetchApplePodcasts() {
  try {
    const r = await fetchWithTimeout("https://itunes.apple.com/search?term=india%20culture&entity=podcast&country=IN&limit=12");
    if (!r.ok) return [];
    const j = await r.json();
    const results = j?.results || [];
    return results.slice(0, 6).map((p) => {
      const name = p.collectionName || p.trackName || "";
      const genre = p.primaryGenreName || "";
      const lens =
        /music/i.test(genre) ? "music_streaming" :
        /sport/i.test(genre) ? "cricket_watching" :
        /comedy|society|culture|arts/i.test(genre) ? "cultural_explorer" :
        "cultural_explorer";
      return {
        query: `${name} (podcast · ${genre})`.slice(0, 140),
        cat: "Apple Podcasts IN",
        lift: 56,
        signal: lens,
        city: "India",
        source: "apple_podcast",
        url: p.collectionViewUrl || null,
        hours_ago: 0,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchAppleAll() {
  const [songs, apps, podcasts] = await Promise.all([
    fetchAppleTopSongs(),
    fetchAppleTopApps(),
    fetchApplePodcasts(),
  ]);
  return [...songs, ...apps, ...podcasts];
}

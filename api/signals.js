// culturepulse-deploy/api/signals.js
// Vercel serverless function — returns live culture signals from Reddit + Google Trends India.
// Also runs as a standalone Node dev server on port 8787 when executed directly:
//   node api/signals.js
//
// Output shape (array of signals) matches what generateSignals() in index.html consumes
// via the GT_CATEGORIES path, so the existing UI/G-badge logic just works.
//
// No npm dependencies — uses built-in fetch (Node 18+).

// ── Source config ────────────────────────────────────────────────────────────
// Google News India search-RSS queries — tuned for the Tuborg lens (beer/youth/India:
// music, nightlife, food delivery, sports, gaming, festivals).
// Each entry maps to a SIG_META key already defined in index.html.
// (Reddit was the first choice but they 403 unauthenticated JSON in 2025+ — switched
//  to Google News which is genuinely better for "mainstream cultural discourse" anyway.)
const NEWS_QUERIES = [
  { q: 'bollywood music OR indian music',           signal: "music_streaming",  city: "Mumbai", cat: "Music"     },
  { q: 'indian rapper OR hip hop india',            signal: "music_streaming",  city: "Mumbai", cat: "Music"     },
  { q: 'music festival india OR sunburn OR nh7',    signal: "festivals",        city: "Pune",   cat: "Events"    },
  { q: 'ipl cricket OR indian cricket team',        signal: "cricket_watching", city: "Mumbai", cat: "Sports"    },
  { q: 'swiggy OR zomato OR food delivery india',   signal: "food_delivery",    city: "BLR",    cat: "Food"      },
  { q: 'bgmi OR esports india OR mobile gaming',    signal: "gaming_mobile",    city: "BLR",    cat: "Gaming"    },
  { q: 'mumbai nightlife OR delhi club OR bar india',signal: "late_night_out",  city: "Mumbai", cat: "Nightlife" },
  { q: 'sneaker india OR streetwear india',         signal: "fashion_sneakers", city: "Mumbai", cat: "Fashion"   },
  { q: 'goa weekend OR himachal trip OR ladakh',    signal: "travel_weekend",   city: "Goa",    cat: "Travel"    },
];

// Google Trends India daily RSS — keyword → signal mapping.
// Order matters: first match wins. \b word boundaries to avoid e.g. "kodiaq" → "odi".
const TREND_KEYWORD_MAP = [
  [/\b(festival|lollapalooza|sunburn|nh7|concert|tour|gig|coachella)\b/i, "festivals"],
  [/\b(song|album|rapper|artist|spotify|music|playlist|edm|hiphop|rap|singer|jukebox|track)\b/i, "music_streaming"],
  [/\b(swiggy|zomato|food|biryani|restaurant|cafe|recipe|cuisine|dosa|paneer)\b/i, "food_delivery"],
  [/\b(bgmi|gaming|esports|valorant|pubg|cod|gta|minecraft|steam)\b/i, "gaming_mobile"],
  [/\b(free fire|free\s?fire)\b/i, "gaming_mobile"],
  [/\b(cricket|ipl|t20|odi|test match|world cup|kohli|rohit|dhoni|csk|mi|rcb|gt|pbks|srh|kkr|dc|rr|lsg)\b/i, "cricket_watching"],
  [/\b(sneaker|nike|adidas|streetwear|jordan|yeezy|puma|crocs)\b/i, "fashion_sneakers"],
  [/\b(bar|club|party|nightlife|rooftop|pub|lounge|dj)\b/i, "late_night_out"],
  [/\b(weekend|travel|trip|getaway|goa|manali|himachal|ladakh|kerala|trek)\b/i, "travel_weekend"],
  [/\b(reel|insta|instagram|tiktok|viral|trending|meme|youtube)\b/i, "digital_expresser"],
];

// Confidence baseline per source — Trends rising queries are behavioural (high),
// Google News is editorial (slightly lower), Wikipedia pageviews are
// observation-of-attention (medium).
const SOURCE_CONFIDENCE = { trends: 0.92, news: 0.82, wiki: 0.78 };

// Geo bleed-through filter: Google News India returns Indian *coverage* of
// foreign events too ("Best things in Abu Dhabi — Indian travellers"). Those
// dilute the brief. Drop or downweight when the headline is unambiguously
// non-India and doesn't reference the Indian diaspora/connection.
const NON_INDIA_GEOS =
  /\b(abu dhabi|dubai|uae|qatar|saudi|kuwait|bahrain|singapore|bangkok|thailand|vietnam|indonesia|malaysia|sydney|melbourne|london|paris|berlin|tokyo|seoul|new york|los angeles|texas|california)\b/i;
const INDIA_CONNECTORS =
  /\b(india|indian|desi|bollywood|mumbai|delhi|bangalore|bengaluru|chennai|kolkata|hyderabad|pune|jaipur|kerala|tamil|telugu|kannada|punjabi|marathi|bengali|gujarati|hindi|nri|diaspora)\b/i;

function isForeignBleed(title) {
  if (!NON_INDIA_GEOS.test(title)) return false;
  return !INDIA_CONNECTORS.test(title);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const TIMEOUT_MS = 4000;

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        // Reddit-compliant UA format: <platform>:<id>:<version> (by /u/<username>)
        "User-Agent": "web:culturepulse:0.1 (by /u/rahulsoni25)",
        "Accept": "application/json, text/xml, */*",
        ...(opts.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

function classifyTrend(title) {
  for (const [re, sig] of TREND_KEYWORD_MAP) {
    if (re.test(title)) return sig;
  }
  return "cultural_explorer"; // catch-all — the "discovery" bucket
}

// ── Google News (India, search RSS) ──────────────────────────────────────────
async function fetchNews({ q, signal, city, cat }) {
  try {
    const url =
      `https://news.google.com/rss/search?q=${encodeURIComponent(q)}` +
      `&hl=en-IN&gl=IN&ceid=IN:en`;
    const r = await fetchWithTimeout(url, { redirect: "follow" });
    if (!r.ok) return [];
    const xml = await r.text();
    const out = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) && out.length < 3) {
      const block = m[1];
      const title =
        (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || "";
      const link =
        (block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) || [])[1] || "";
      const pub =
        (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
      const clean = title.trim().replace(/\s+/g, " ");
      if (!clean) continue;
      // Drop items where the headline is unambiguously about a non-India geo
      // with no Indian connector (Abu Dhabi event, Texas concert, etc.) — these
      // dilute the India-context brief.
      if (isForeignBleed(clean)) continue;
      // Lift = recency-weighted (newer = higher), normalized 30-90
      const hoursAgo = pub ? Math.max(0, (Date.now() - Date.parse(pub)) / 36e5) : 24;
      const lift = Math.min(90, Math.max(30, Math.round(85 - hoursAgo * 0.7)));
      out.push({
        query: clean.slice(0, 140),
        cat,
        lift,
        signal,
        city,
        source: "news",
        url: link.trim(),
        hours_ago: Math.round(hoursAgo),
        query_topic: q,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Google Trends (India daily RSS) ──────────────────────────────────────────
async function fetchGoogleTrendsIN() {
  try {
    const r = await fetchWithTimeout(
      "https://trends.google.com/trending/rss?geo=IN"
    );
    if (!r.ok) return [];
    const xml = await r.text();
    // Crude RSS parse — avoids a parser dependency. RSS items are simple here.
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) && items.length < 12) {
      const block = m[1];
      const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || "";
      const traffic =
        (block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) || [])[1] || "0";
      const clean = title.trim();
      if (!clean) continue;
      // Parse "50,000+" → 50000, then map to a lift 50-95
      const num = parseInt(traffic.replace(/[^\d]/g, ""), 10) || 0;
      const lift = Math.min(95, Math.max(50, Math.round(50 + Math.log10(num + 10) * 10)));
      items.push({
        query: clean,
        cat: "Trending IN",
        lift,
        signal: classifyTrend(clean),
        city: "India",
        source: "trends",
        traffic: num,
      });
    }
    return items;
  } catch {
    return [];
  }
}

// ── Wikipedia (en.wikipedia featured / most-read — India-relevant slice) ─────
// We filter the global most-read list to articles that either (a) match an
// Indian connector (Bollywood, Mumbai, etc.) or (b) classify into one of our
// cultural buckets. Small but high-quality signal.
async function fetchWikipediaTop() {
  try {
    // Most-read feed has a 1-day lag; use yesterday's UTC date.
    const d = new Date(Date.now() - 24 * 36e5);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const url = `https://en.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${day}`;
    const r = await fetchWithTimeout(url);
    if (!r.ok) return [];
    const j = await r.json();
    const articles = (j?.mostread?.articles || []).slice(0, 50);
    const items = [];
    for (const a of articles) {
      const title = (a.normalizedtitle || a.titles?.normalized || a.title || "").trim();
      if (!title) continue;
      if (/^(deaths in|wikipedia|main page|special:|portal:)/i.test(title)) continue;
      const sig = classifyTrend(title);
      const isIndia = INDIA_CONNECTORS.test(title);
      // Keep if India-connected OR mapped to a non-catch-all cultural bucket.
      if (!isIndia && sig === "cultural_explorer") continue;
      const views = a.views || 0;
      const lift = Math.min(90, Math.max(45, Math.round(35 + Math.log10(views + 100) * 6)));
      items.push({
        query: title,
        cat: "Wikipedia",
        lift,
        signal: sig,
        city: isIndia ? "India" : "Global",
        source: "wiki",
        views,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent((a.article || title).replace(/ /g, "_"))}`,
      });
      if (items.length >= 6) break;
    }
    return items;
  } catch {
    return [];
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
async function buildSignals() {
  const [trends, wiki, ...newsBatches] = await Promise.all([
    fetchGoogleTrendsIN(),
    fetchWikipediaTop(),
    ...NEWS_QUERIES.map(fetchNews),
  ]);
  const news = newsBatches.flat();
  const all = [...trends, ...wiki, ...news];

  // Tag with confidence + source flags so the frontend can render G/N/W badges.
  return all.map((s, idx) => ({
    id: idx,
    ...s,
    confidence: SOURCE_CONFIDENCE[s.source] || 0.8,
    from_trends: s.source === "trends",
    from_news:   s.source === "news",
    from_wiki:   s.source === "wiki",
    fetched_at: new Date().toISOString(),
  }));
}

export default async function handler(req, res) {
  // CORS — open for now, tighten when we know the prod domain.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600"); // 5min CDN cache
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  try {
    const signals = await buildSignals();
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        count: signals.length,
        fetched_at: new Date().toISOString(),
        signals,
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
}

// Standalone dev server lives in scripts/dev-api.mjs — kept out of this file so
// Vercel's function bundler doesn't trip on top-level dynamic imports.
export { buildSignals }; // exposed for the dev runner

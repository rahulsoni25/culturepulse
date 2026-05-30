// api/sources-social.js
// ──────────────────────────────────────────────────────────────────────────────
// SOCIAL LISTENING SOURCES (free, no API key required)
//
// Cultural signal is highest-fidelity when it comes from where audiences
// actually hang out. This module wires the social sources reachable via
// public Atom/RSS feeds — no key, no business account, no OAuth.
//
// Wired here:
//   1. Reddit  — Atom feeds per subreddit (https://reddit.com/r/<sub>/hot/.rss)
//                Reddit JSON is blocked in 2025; Atom feeds remain open.
//   2. YouTube — channel-RSS feeds per Indian music/culture channel.
//                No Data-API quota needed for channel feeds. Returns the
//                last ~15 uploads per channel.
//
// Deferred to a future iteration (see DEFERRED_SOURCES.md in repo root):
//   • Pinterest — needs business OAuth + app review
//   • Instagram — needs Meta Developer app + hashtag-scope app review
//   • X / Twitter — needs paid API tier ($200/mo minimum)
//   • Spotify — needs Client Credentials API key (one-time app reg)
//   • Last.fm — needs free API key
//   • YouTube Data API (region trending + comments) — needs API key
//
// The sources here are tagged with explicit signal lens mappings so they
// flow straight into the L1 theme clusterer without additional inference.
// ──────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 5000;
const UA = "culturepulse/0.3 (+https://culturepulse-seven.vercel.app)";

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept": "application/atom+xml, application/xml, */*", ...(opts.headers || {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

// ── REDDIT ─────────────────────────────────────────────────────────────────
// India cultural subreddits, hand-curated. Each maps to a primary signal
// lens (matching SIG_META keys used throughout the pipeline) so signals
// flow correctly into the theme clusterer downstream.
const SUBREDDITS = [
  // General Indian discourse — multi-lens, mostly cultural_explorer
  { sub: "india",                lens: "cultural_explorer",  city: "India",     cat: "Reddit · general" },
  // Generation Z / college
  { sub: "IndianTeenagers",      lens: "digital_expresser",  city: "Mumbai",    cat: "Reddit · Gen Z" },
  { sub: "IndianAcademia",       lens: "experience_maximiser", city: "BLR",     cat: "Reddit · students" },
  // Entertainment + music
  { sub: "bollywood",            lens: "music_streaming",    city: "Mumbai",    cat: "Reddit · Bollywood" },
  { sub: "IndianHipHopHeads",    lens: "music_streaming",    city: "Mumbai",    cat: "Reddit · hip-hop" },
  { sub: "indianmusic",          lens: "music_streaming",    city: "Mumbai",    cat: "Reddit · indie music" },
  // Food + delivery
  { sub: "IndianFood",           lens: "food_delivery",      city: "Mumbai",    cat: "Reddit · food" },
  // Gaming
  { sub: "IndianGaming",         lens: "gaming_mobile",      city: "BLR",       cat: "Reddit · gaming" },
  // Sport
  { sub: "Cricket",              lens: "cricket_watching",   city: "Mumbai",    cat: "Reddit · cricket" },
  // Cities (late-night, nightlife, local culture)
  { sub: "mumbai",               lens: "late_night_out",     city: "Mumbai",    cat: "Reddit · Mumbai" },
  { sub: "bangalore",            lens: "late_night_out",     city: "BLR",       cat: "Reddit · BLR" },
  { sub: "delhi",                lens: "late_night_out",     city: "Delhi",     cat: "Reddit · Delhi" },
  // Fashion / streetwear
  { sub: "IndianStreetwear",     lens: "fashion_sneakers",   city: "Mumbai",    cat: "Reddit · streetwear" },
  // Meme + cultural identity
  { sub: "IndianDankMemes",      lens: "digital_expresser",  city: "India",     cat: "Reddit · memes" },
];

// Parse a single Atom <entry>...</entry> block.
function parseRedditEntry(block) {
  const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
  const linkMatch  = block.match(/<link\s+href="([^"]+)"/);
  const updatedMatch = block.match(/<updated>([\s\S]*?)<\/updated>/);
  const authorMatch = block.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/);
  if (!titleMatch) return null;
  return {
    title: titleMatch[1].trim(),
    link: linkMatch ? linkMatch[1] : null,
    updated: updatedMatch ? updatedMatch[1] : null,
    author: authorMatch ? authorMatch[1] : null,
  };
}

async function fetchSubreddit({ sub, lens, city, cat }) {
  try {
    const r = await fetchWithTimeout(`https://www.reddit.com/r/${sub}/hot/.rss?limit=10`);
    if (!r.ok) return [];
    const xml = await r.text();
    const out = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = entryRe.exec(xml)) && out.length < 4) {
      const e = parseRedditEntry(m[1]);
      if (!e || !e.title) continue;
      // Skip the sticky AutoModerator / Mod posts which are usually rules/meta.
      if (/automoderator|moderator|^weekly|^daily/i.test(e.author || "") ||
          /weekly thread|daily thread|megathread|rules/i.test(e.title)) continue;
      // Recency: only posts within last 7 days
      const hoursAgo = e.updated ? Math.max(0, (Date.now() - Date.parse(e.updated)) / 36e5) : 24;
      if (hoursAgo > 24 * 7) continue;
      // Lift: recency-weighted, normalised to 35-85
      const lift = Math.min(85, Math.max(35, Math.round(78 - hoursAgo * 0.4)));
      out.push({
        query: e.title.slice(0, 140),
        cat,
        lift,
        signal: lens,
        city,
        source: "reddit",
        sub,
        url: e.link,
        hours_ago: Math.round(hoursAgo),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchRedditAll() {
  // Run all subreddits in parallel; tolerate individual failures.
  const batches = await Promise.all(SUBREDDITS.map(fetchSubreddit));
  return batches.flat();
}

// ── YOUTUBE (channel RSS, no key) ──────────────────────────────────────────
// Curated channel IDs for India music + culture + food + festival creators.
// `https://www.youtube.com/feeds/videos.xml?channel_id=<id>` returns ~15
// latest uploads per channel. We pull recent ones, parse title + publish
// date, and map to a signal lens.
const YT_CHANNELS = [
  // Music — Bollywood / hip-hop / indie
  { id: "UCq-Fj5jknLsUf-MWSy4_brA", name: "T-Series",                    lens: "music_streaming", city: "Mumbai" },
  { id: "UCqQTSGwd3wPV2Vw43oFXNvw", name: "Sony Music India",            lens: "music_streaming", city: "Mumbai" },
  { id: "UC56gTxNs4f9xZ7Pa2i5xNzg", name: "Mass Appeal India",           lens: "music_streaming", city: "Mumbai" },
  { id: "UCwbb_S7BoDuyz3hCNNlAfHA", name: "Def Jam India",               lens: "music_streaming", city: "Mumbai" },
  // Indian indie
  { id: "UCwGgiKZJjY6cHsgZ49AHC3w", name: "OML Entertainment",           lens: "festivals",       city: "Mumbai" },
  // Food / delivery culture
  { id: "UC9p_8jXMhEEpa8WHl9TVqOQ", name: "Curly Tales",                 lens: "food_delivery",   city: "Mumbai" },
  { id: "UCgyqtMTM3ad6sFK5Up_AHBA", name: "Goya",                        lens: "food_delivery",   city: "Mumbai" },
  // Lifestyle / Gen Z
  { id: "UC9XYnYS9ZbUkB7Dh3qDOlIw", name: "Tanmay Bhat",                 lens: "digital_expresser", city: "Mumbai" },
  { id: "UCw3Tr_2EkdaUlxhEbcwK_GA", name: "BeYouNick",                   lens: "digital_expresser", city: "Mumbai" },
  // Cricket
  { id: "UCEzbtTuUI2KaykFNTuLzPaA", name: "Cricbuzz",                    lens: "cricket_watching", city: "Mumbai" },
];

function parseYouTubeEntry(block) {
  const t = block.match(/<title>([\s\S]*?)<\/title>/);
  const p = block.match(/<published>([\s\S]*?)<\/published>/);
  const l = block.match(/<link\s+rel="alternate"\s+href="([^"]+)"/);
  if (!t) return null;
  return { title: t[1].trim(), published: p ? p[1] : null, link: l ? l[1] : null };
}

async function fetchYouTubeChannel({ id, name, lens, city }) {
  try {
    const r = await fetchWithTimeout(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
    if (!r.ok) return [];
    const xml = await r.text();
    const out = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = entryRe.exec(xml)) && out.length < 2) {
      const e = parseYouTubeEntry(m[1]);
      if (!e) continue;
      const hoursAgo = e.published ? Math.max(0, (Date.now() - Date.parse(e.published)) / 36e5) : 24;
      if (hoursAgo > 24 * 14) continue; // skip videos > 2 weeks old
      const lift = Math.min(88, Math.max(40, Math.round(82 - hoursAgo * 0.25)));
      out.push({
        query: e.title.slice(0, 140),
        cat: `YouTube · ${name}`,
        lift,
        signal: lens,
        city,
        source: "youtube",
        channel: name,
        url: e.link,
        hours_ago: Math.round(hoursAgo),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchYouTubeAll() {
  const batches = await Promise.all(YT_CHANNELS.map(fetchYouTubeChannel));
  return batches.flat();
}

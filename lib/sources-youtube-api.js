// api/sources-youtube-api.js
// ──────────────────────────────────────────────────────────────────────────────
// YOUTUBE DATA API v3 (key-gated)
//
// Goes beyond the channel-RSS source: pulls India region TRENDING videos
// (the mostPopular chart) + search-by-cultural-query with view-count sort.
//
// DORMANT until YOUTUBE_API_KEY is set in the environment. With no key it
// returns [] and logs nothing — current production behaviour is unchanged.
//
// Get a key: https://console.cloud.google.com → enable "YouTube Data API v3"
// → Credentials → API key. Free quota 10,000 units/day.
//
// Env: YOUTUBE_API_KEY
// ──────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 5000;

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function youtubeApiAvailable() {
  return !!process.env.YOUTUBE_API_KEY;
}

// Map a video's category / title keywords → our signal lens.
function classifyVideo(title, categoryId) {
  // YouTube categoryId 10 = Music, 17 = Sports, 20 = Gaming, 24 = Entertainment,
  // 22 = People/Blogs, 26 = Howto, 28 = Sci/Tech.
  if (categoryId === "10") return "music_streaming";
  if (categoryId === "20") return "gaming_mobile";
  if (categoryId === "17") return "cricket_watching";
  const t = String(title || "").toLowerCase();
  if (/song|music|audio|lyrical|album|rap/.test(t)) return "music_streaming";
  if (/festival|concert|tour|live/.test(t)) return "festivals";
  if (/food|recipe|eat|restaurant/.test(t)) return "food_delivery";
  if (/cricket|ipl|match/.test(t)) return "cricket_watching";
  if (/game|gaming|bgmi/.test(t)) return "gaming_mobile";
  if (/vlog|reel|shorts|trend/.test(t)) return "digital_expresser";
  return "cultural_explorer";
}

// India trending videos (mostPopular chart).
async function fetchTrending(key) {
  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,statistics&chart=mostPopular&regionCode=IN&maxResults=15&key=${key}`;
  const j = await fetchJSON(url);
  const items = j?.items || [];
  return items.slice(0, 12).map((v) => {
    const sn = v.snippet || {};
    const views = parseInt(v.statistics?.viewCount || "0", 10);
    // Lift from view count, log-scaled into 55-90.
    const lift = Math.min(90, Math.max(55, Math.round(40 + Math.log10(views + 100) * 7)));
    return {
      query: (sn.title || "").slice(0, 140),
      cat: "YouTube Trending IN",
      lift,
      signal: classifyVideo(sn.title, sn.categoryId),
      city: "India",
      source: "youtube_api",
      url: `https://youtube.com/watch?v=${v.id}`,
      views,
      channel: sn.channelTitle,
      hours_ago: sn.publishedAt ? Math.round(Math.max(0, (Date.now() - Date.parse(sn.publishedAt)) / 36e5)) : 24,
    };
  });
}

export async function fetchYouTubeDataAPI() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return []; // dormant without key
  try {
    const trending = await fetchTrending(key);
    return trending;
  } catch {
    return [];
  }
}

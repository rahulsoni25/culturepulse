// api/sources-lastfm.js
// ──────────────────────────────────────────────────────────────────────────────
// LAST.FM API (key-gated)
//
// Geographic top tracks + top artists for India — actual scrobble behaviour,
// which is the listening-overlap / tribe signal Spotify would have given us
// (Spotify gates its Web API behind Premium; Last.fm does not).
//
// DORMANT until LASTFM_API_KEY is set. Returns [] with no key.
// Get a free key: https://www.last.fm/api/account/create
//
// Env: LASTFM_API_KEY
// ──────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 5000;

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "culturepulse/0.4" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function lastfmAvailable() {
  return !!process.env.LASTFM_API_KEY;
}

// India top tracks (geo.getTopTracks) — what the country is scrobbling.
// NOTE: Last.fm's India scrobbler base skews heavily to one or two fandoms
// (currently K-pop), which can monopolise the chart. We cap to 2 tracks per
// artist so the signal reflects breadth, not a single fan-club's volume.
async function fetchTopTracks(key) {
  const url =
    `https://ws.audioscrobbler.com/2.0/?method=geo.gettoptracks&country=india` +
    `&limit=50&api_key=${key}&format=json`;
  const j = await fetchJSON(url);
  const tracks = j?.tracks?.track || [];
  const perArtist = {};
  const out = [];
  for (const t of tracks) {
    const artist = t.artist?.name || "";
    perArtist[artist] = (perArtist[artist] || 0) + 1;
    if (perArtist[artist] > 2) continue; // cap monoculture
    const i = out.length;
    out.push({
      query: `${t.name || ""} — ${artist}`.slice(0, 140),
      cat: "Last.fm Top Tracks IN",
      lift: Math.max(58, 88 - i * 3),
      signal: "music_streaming",
      city: "India",
      source: "lastfm",
      rank: i + 1,
      url: t.url || null,
      hours_ago: 0,
    });
    if (out.length >= 8) break;
  }
  return out;
}

// India top artists (geo.getTopArtists) — tribe-level signal.
async function fetchTopArtists(key) {
  const url =
    `https://ws.audioscrobbler.com/2.0/?method=geo.gettopartists&country=india` +
    `&limit=8&api_key=${key}&format=json`;
  const j = await fetchJSON(url);
  const artists = j?.topartists?.artist || [];
  return artists.slice(0, 5).map((a, i) => {
    const lift = Math.max(55, 80 - i * 3);
    return {
      query: `${a.name || ""} trending among India listeners`.slice(0, 140),
      cat: "Last.fm Top Artists IN",
      lift,
      signal: "cultural_explorer",
      city: "India",
      source: "lastfm",
      rank: i + 1,
      url: a.url || null,
      hours_ago: 0,
    };
  });
}

export async function fetchLastfmIndia() {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return []; // dormant without key
  try {
    const [tracks, artists] = await Promise.all([fetchTopTracks(key), fetchTopArtists(key)]);
    return [...tracks, ...artists];
  } catch {
    return [];
  }
}

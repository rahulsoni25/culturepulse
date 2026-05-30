// api/sources-tmdb.js
// ──────────────────────────────────────────────────────────────────────────────
// TMDB — The Movie Database (key-gated)
//
// Trending movies + TV globally and India-relevant titles. OTT/film is a
// massive India culture driver (Bollywood, regional cinema, the streaming
// wars). TMDB's trending endpoint is the cleanest free view of it.
//
// DORMANT until TMDB_API_KEY is set. Returns [] with no key.
// Get a free key: https://www.themoviedb.org/settings/api (instant, no card)
//
// Env: TMDB_API_KEY  (the v3 API key — a 32-char hex string)
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

export function tmdbAvailable() {
  return !!process.env.TMDB_API_KEY;
}

// Trending all (movie + tv) this week — the global pulse.
async function fetchTrending(key) {
  const j = await fetchJSON(`https://api.themoviedb.org/3/trending/all/week?api_key=${key}`);
  const results = j?.results || [];
  return results.slice(0, 8).map((r, i) => {
    const title = r.title || r.name || "";
    const isTV = r.media_type === "tv";
    // Popularity drives lift; trending titles are inherently current.
    const lift = Math.max(58, 90 - i * 3);
    return {
      query: `${title}${isTV ? " (series)" : " (film)"} trending`.slice(0, 140),
      cat: "TMDB Trending",
      lift,
      signal: "digital_expresser", // OTT/film viewing = expression + identity
      city: "Global",
      source: "tmdb",
      rank: i + 1,
      vote: r.vote_average,
      url: `https://www.themoviedb.org/${r.media_type}/${r.id}`,
      hours_ago: 0,
    };
  });
}

// India-relevant: discover movies in Hindi/Tamil/Telugu sorted by recent
// popularity — what Indian-language cinema is hot.
async function fetchIndiaCinema(key) {
  // with_original_language=hi (Hindi). region IN. Recent + popular.
  const j = await fetchJSON(
    `https://api.themoviedb.org/3/discover/movie?api_key=${key}` +
    `&with_original_language=hi&region=IN&sort_by=popularity.desc&page=1`
  );
  const results = j?.results || [];
  return results.slice(0, 6).map((r, i) => {
    const lift = Math.max(55, 82 - i * 3);
    return {
      query: `${r.title || r.original_title || ""} (Hindi cinema)`.slice(0, 140),
      cat: "TMDB India Cinema",
      lift,
      signal: "digital_expresser",
      city: "India",
      source: "tmdb",
      rank: i + 1,
      vote: r.vote_average,
      url: `https://www.themoviedb.org/movie/${r.id}`,
      hours_ago: 0,
    };
  });
}

export async function fetchTMDB() {
  const key = process.env.TMDB_API_KEY;
  if (!key) return []; // dormant without key
  try {
    const [trending, india] = await Promise.all([fetchTrending(key), fetchIndiaCinema(key)]);
    return [...trending, ...india];
  } catch {
    return [];
  }
}

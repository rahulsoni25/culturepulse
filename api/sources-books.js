// api/sources-books.js
// ──────────────────────────────────────────────────────────────────────────────
// GOOGLE BOOKS API (key-gated)
//
// What India is reading — newest high-relevance India titles. A slower-moving
// but high-trust cultural signal (reading taste shifts precede mainstream).
//
// DORMANT until GOOGLE_BOOKS_API_KEY is set. Returns [] with no key.
// Get a key: same Google Cloud project as YouTube — enable "Books API".
//
// Env: GOOGLE_BOOKS_API_KEY
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

export function booksAvailable() {
  return !!process.env.GOOGLE_BOOKS_API_KEY;
}

export async function fetchGoogleBooksIndia() {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return []; // dormant without key
  try {
    // Newest India-relevant titles, ordered by recency.
    const url =
      `https://www.googleapis.com/books/v1/volumes` +
      `?q=subject:India&orderBy=newest&maxResults=12&country=IN&key=${key}`;
    const j = await fetchJSON(url);
    const items = j?.items || [];
    const out = [];
    for (const b of items.slice(0, 8)) {
      const v = b.volumeInfo || {};
      const title = (v.title || "").trim();
      if (!title) continue;
      const author = (v.authors || [])[0] || "";
      out.push({
        query: `${title}${author ? " — " + author : ""}`.slice(0, 140),
        cat: "Google Books IN",
        lift: 52, // slower-moving cultural signal, modest lift
        signal: "cultural_explorer",
        city: "India",
        source: "books",
        url: v.infoLink || null,
        hours_ago: 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

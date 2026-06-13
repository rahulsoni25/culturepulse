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
    // "subject:India + orderBy=newest" returns reprints of old classics, so
    // instead query for recently-published Indian-interest titles and keep
    // only those published in the last ~2 years. Better "what India reads now".
    const thisYear = new Date().getFullYear();
    const url =
      `https://www.googleapis.com/books/v1/volumes` +
      `?q=${encodeURIComponent("indian author fiction OR indian politics OR contemporary india")}` +
      `&orderBy=newest&maxResults=20&country=IN&key=${key}`;
    const j = await fetchJSON(url);
    const items = j?.items || [];
    // Since orderBy=newest already sorts recent-first, prefer items with a
    // year in the last 4 years, but DON'T drop undated ones outright (Google
    // Books often omits dates on legitimately new titles). Two-pass: dated-
    // recent first, then fill from undated to guarantee we return something.
    const dated = [];
    const undated = [];
    for (const b of items) {
      const v = b.volumeInfo || {};
      const title = (v.title || "").trim();
      if (!title) continue;
      const author = (v.authors || [])[0] || "";
      const yr = parseInt((v.publishedDate || "").slice(0, 4), 10);
      const entry = {
        query: `${title}${author ? " — " + author : ""}${yr ? " (" + yr + ")" : ""}`.slice(0, 140),
        cat: "Google Books IN",
        lift: 52,
        signal: "cultural_explorer",
        city: "India",
        source: "books",
        url: v.infoLink || null,
        hours_ago: 0,
      };
      if (yr && yr >= thisYear - 4) dated.push(entry);
      else if (!yr) undated.push(entry);
    }
    return [...dated, ...undated].slice(0, 6);
  } catch {
    return [];
  }
}

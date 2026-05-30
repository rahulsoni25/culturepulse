// api/sources-ticketmaster.js
// ──────────────────────────────────────────────────────────────────────────────
// TICKETMASTER DISCOVERY API (key-gated)
//
// Live events in India — concerts, festivals, shows. Real "what people are
// buying tickets to" demand signal. Maps to festivals / music / experience.
//
// DORMANT until TICKETMASTER_API_KEY is set. Returns [] with no key.
// Get a free key: https://developer.ticketmaster.com → My Apps → Consumer Key
//
// Env: TICKETMASTER_API_KEY
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

export function ticketmasterAvailable() {
  return !!process.env.TICKETMASTER_API_KEY;
}

// Classify by Ticketmaster segment/genre.
function classifyEvent(segment, genre, name) {
  const s = `${segment} ${genre} ${name}`.toLowerCase();
  if (/music|concert|festival|edm|hip.?hop|rock|pop/.test(s)) return "festivals";
  if (/sport|cricket|football|kabaddi/.test(s)) return "cricket_watching";
  if (/art|theatre|comedy|film/.test(s)) return "cultural_explorer";
  return "experience_maximiser";
}

export async function fetchTicketmasterIndia() {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return []; // dormant without key
  try {
    const url =
      `https://app.ticketmaster.com/discovery/v2/events.json` +
      `?countryCode=IN&size=15&sort=date,asc&apikey=${key}`;
    const j = await fetchJSON(url);
    const events = j?._embedded?.events || [];
    const out = [];
    for (const e of events.slice(0, 10)) {
      const name = (e.name || "").trim();
      if (!name) continue;
      const seg = e.classifications?.[0]?.segment?.name || "";
      const genre = e.classifications?.[0]?.genre?.name || "";
      const venue = e._embedded?.venues?.[0];
      const city = venue?.city?.name || "India";
      out.push({
        query: `${name}${genre ? " (" + genre + ")" : ""}`.slice(0, 140),
        cat: "Ticketmaster IN events",
        lift: 60, // demand signal, moderate fixed lift
        signal: classifyEvent(seg, genre, name),
        city,
        source: "ticketmaster",
        url: e.url || null,
        date: e.dates?.start?.localDate || null,
        hours_ago: 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

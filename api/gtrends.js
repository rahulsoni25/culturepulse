// api/gtrends.js
// ──────────────────────────────────────────────────────────────────────────────
// REAL GOOGLE TRENDS — keyword + geo, the data Trends actually exposes.
//
// Google has NO official Trends API. This uses the same explore → widgetdata
// flow that pytrends / google-trends-api use:
//   1. /explore           → returns widget tokens for the keyword + geo + time
//   2. /widgetdata/relatedsearches → TOP + RISING related queries
//   3. /widgetdata/comparedgeo     → interest by region (states, or cities)
//   4. /widgetdata/multiline       → interest over time
//
// What Google Trends genuinely provides: TIME × GEOGRAPHY × RELATED QUERIES.
// What it does NOT provide: age / gender / demographics — those live in Google
// Ads audience tooling, not Trends. We never fabricate them here; the age layer
// is computed by CulturePulse from persona weights and is labelled as ours.
//
// Reliability: Google rate-limits datacenter IPs (Vercel runs on those), so the
// call can 429. We cache successes for 30 min and return ok:false + reason on
// block, so the frontend can fall back to the live-signal strip honestly.
// ──────────────────────────────────────────────────────────────────────────────

const BASE = "https://trends.google.com/trends/api";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const COOKIE = "CONSENT=YES+cb.20211207-12-p0.en+FX+410; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg";
const TIMEOUT_MS = 8000;

// India: City filter value → ISO-3166-2 state code. Selecting a city makes the
// region breakdown zoom into that state's cities; "all" stays national (states).
const CITY_STATE = {
  mumbai: "IN-MH", pune: "IN-MH",
  delhi: "IN-DL",
  bangalore: "IN-KA",
  hyderabad: "IN-TG",
  chennai: "IN-TN",
  kolkata: "IN-WB",
};
const STATE_LABEL = {
  "IN-MH": "Maharashtra", "IN-DL": "Delhi", "IN-KA": "Karnataka",
  "IN-TG": "Telangana", "IN-TN": "Tamil Nadu", "IN-WB": "West Bengal",
};

// Time window dropdown (ftime 0..3) → Trends time range string.
function timeRange(t) {
  switch (String(t)) {
    case "0": return "now 1-d";
    case "1": return "now 7-d";
    case "2": return "now 7-d";
    case "3": return "today 1-m";
    default:  return "today 3-m";
  }
}

// Google's explore endpoint 429s without a valid NID cookie. pytrends solves
// this by visiting the site once to collect Set-Cookie, then reusing it. We
// prime once and cache the cookie string for the function's warm lifetime.
let PRIMED_COOKIE = null;
let PRIMED_AT = 0;
async function primeCookie() {
  if (PRIMED_COOKIE && Date.now() - PRIMED_AT < 30 * 60 * 1000) return PRIMED_COOKIE;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetch("https://trends.google.com/trends/explore?geo=IN&hl=en-US", {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Cookie: COOKIE, "Accept-Language": "en-US,en;q=0.9" },
    }).finally(() => clearTimeout(t));
    const setCookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
    const pairs = [COOKIE];
    for (const c of setCookies) {
      const kv = c.split(";")[0];
      if (/^(NID|__Secure|1P_JAR|AEC|SOCS)/i.test(kv)) pairs.push(kv);
    }
    PRIMED_COOKIE = pairs.join("; ");
    PRIMED_AT = Date.now();
  } catch {
    PRIMED_COOKIE = COOKIE;
    PRIMED_AT = Date.now();
  }
  return PRIMED_COOKIE;
}

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const cookie = await primeCookie();
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Cookie: cookie, Accept: "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", Referer: "https://trends.google.com/trends/explore" },
    });
  } finally {
    clearTimeout(t);
  }
}

// Trends responses are prefixed with ")]}'," — strip to first { or [.
function parseTrends(text) {
  const i = text.search(/[[{]/);
  if (i < 0) throw new Error("unparseable trends payload");
  return JSON.parse(text.slice(i));
}

async function explore(keyword, geo, time) {
  const req = {
    comparisonItem: [{ keyword, geo, time }],
    category: 0,
    property: "",
  };
  const url = `${BASE}/explore?hl=en-US&tz=-330&req=${encodeURIComponent(JSON.stringify(req))}`;
  const r = await fetchWithTimeout(url);
  if (r.status === 429) throw new Error("429");
  if (!r.ok) throw new Error("explore " + r.status);
  const j = parseTrends(await r.text());
  return j.widgets || [];
}

async function widget(path, w) {
  const url = `${BASE}/widgetdata/${path}?hl=en-US&tz=-330&req=${encodeURIComponent(
    JSON.stringify(w.request)
  )}&token=${encodeURIComponent(w.token)}`;
  const r = await fetchWithTimeout(url);
  if (r.status === 429) throw new Error("429");
  if (!r.ok) throw new Error(path + " " + r.status);
  return parseTrends(await r.text());
}

// ── In-memory cache (30 min). Never caches failures. ────────────────────────
const CACHE = new Map();
const TTL_MS = 30 * 60 * 1000;
const cacheGet = (k) => {
  const e = CACHE.get(k);
  if (e && Date.now() - e.t < TTL_MS) return e.v;
  if (e) CACHE.delete(k);
  return null;
};
const cacheSet = (k, v) => CACHE.set(k, { t: Date.now(), v });

export async function buildTrends({ keyword, city, time } = {}) {
  const kw = String(keyword || "").trim();
  if (!kw) throw new Error("no keyword");
  const state = CITY_STATE[String(city || "").toLowerCase()] || null;
  const geo = state || "IN";
  const tr = timeRange(time);
  const cacheKey = `${kw.toLowerCase()}|${geo}|${tr}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true };

  const widgets = await explore(kw, geo, tr);
  const find = (id) => widgets.find((w) => w.id === id || (w.id || "").startsWith(id));

  const out = {
    keyword: kw,
    geo,
    geo_label: state ? STATE_LABEL[state] : "India",
    region_resolution: state ? "Cities" : "States",
    time_range: tr,
    rising: [],
    top: [],
    by_region: [],
    over_time: [],
  };

  // Related queries (TOP + RISING) — run these first; they're the headline.
  const wRelated = find("RELATED_QUERIES");
  if (wRelated) {
    try {
      const j = await widget("relatedsearches", wRelated);
      const lists = j?.default?.rankedList || [];
      const top = (lists[0]?.rankedKeyword || []).slice(0, 10);
      const rising = (lists[1]?.rankedKeyword || []).slice(0, 10);
      out.top = top.map((k) => ({
        query: k.query,
        value: k.value,
        link: k.link ? "https://trends.google.com" + k.link : null,
      }));
      out.rising = rising.map((k) => ({
        query: k.query,
        // Rising "value" can be a % or a breakout flag (value >= 5000 ≈ Breakout).
        change: k.formattedValue || (k.value >= 5000 ? "Breakout" : "+" + k.value + "%"),
        breakout: k.value >= 5000 || /breakout/i.test(k.formattedValue || ""),
        link: k.link ? "https://trends.google.com" + k.link : null,
      }));
    } catch (e) { out._related_error = String(e.message || e); }
  }

  // Interest by region (states nationally, or cities within the selected state).
  const wGeo = find("GEO_MAP");
  if (wGeo) {
    try {
      const j = await widget("comparedgeo", wGeo);
      const rows = (j?.default?.geoMapData || []).filter((g) => (g.value && g.value[0] > 0));
      out.by_region = rows
        .sort((a, b) => (b.value[0] || 0) - (a.value[0] || 0))
        .slice(0, 12)
        .map((g) => ({ name: g.geoName, value: g.value[0], code: g.geoCode || null }));
    } catch (e) { out._geo_error = String(e.message || e); }
  }

  // Interest over time (sparkline).
  const wTime = find("TIMESERIES");
  if (wTime) {
    try {
      const j = await widget("multiline", wTime);
      const tl = j?.default?.timelineData || [];
      out.over_time = tl.map((p) => ({ t: p.formattedTime || p.time, v: (p.value && p.value[0]) || 0 }));
    } catch (e) { out._time_error = String(e.message || e); }
  }

  // Only cache a genuinely useful result.
  if (out.rising.length || out.top.length || out.by_region.length) cacheSet(cacheKey, out);
  return out;
}

// ── HTTP handler: GET /api/gtrends?keyword=...&city=...&time=... ─────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  const u = new URL(req.url || "/", "http://localhost");
  const keyword = u.searchParams.get("keyword") || u.searchParams.get("brand") || u.searchParams.get("q") || "";
  const city = u.searchParams.get("city") || u.searchParams.get("cityName") || "all";
  const time = u.searchParams.get("time") || "";
  res.setHeader("Content-Type", "application/json");
  if (!keyword.trim()) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "Provide ?keyword=" }));
  }
  try {
    const data = await buildTrends({ keyword, city, time });
    const has = data.rising.length || data.top.length || data.by_region.length;
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: !!has, source: "google_trends", ...data,
      note: has ? null : "Google Trends returned no data for this term/geo." }));
  } catch (err) {
    const msg = String(err?.message || err);
    const blocked = msg === "429" || /429/.test(msg);
    res.statusCode = 200; // soft-fail so the UI can fall back gracefully
    res.end(JSON.stringify({
      ok: false,
      source: "google_trends",
      blocked,
      error: blocked ? "Google Trends rate-limited this server (429)." : msg,
    }));
  }
}

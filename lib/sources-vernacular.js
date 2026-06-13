// api/sources-vernacular.js
// ──────────────────────────────────────────────────────────────────────────────
// VERNACULAR WIKIPEDIA — the India-language wedge
//
// Legacy "culture intelligence" platforms (Brandwatch, Talkwalker, Sprinklr)
// are functionally blind to non-English India. They process English Twitter,
// English news. They don't know what 600M Hindi/Tamil/Bengali/Telugu/Marathi
// speakers are looking up.
//
// Wikipedia exposes per-language most-read feeds, free, no key. This is the
// cleanest signal for "what is each language community actually consuming"
// available without scraping.
//
// Wired here:
//   • hi.wikipedia.org   (Hindi)
//   • ta.wikipedia.org   (Tamil)
//   • bn.wikipedia.org   (Bengali)
//
// Article titles come back in their native script. We classify with a
// bilingual keyword map (Devanagari/Tamil/Bengali + transliterated). Items
// that don't match a specific lens land in cultural_explorer — which is
// honest: a Hindi article we can't auto-classify is still a cultural signal
// worth showing.
// ──────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 5000;
const UA = "culturepulse/0.3 (+https://culturepulse-seven.vercel.app)";

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

// Lens classifier — works on native-script + transliterated terms.
// Order matters: first match wins. Devanagari / Tamil / Bengali patterns
// are surfaced via Unicode escapes for clarity.
const VERNACULAR_LENS_MAP = [
  // Music — Hindi, Tamil, Bengali (any of: song, music, singer, album, artist)
  [/(गाना|संगीत|गायक|गायिका|रैपर|अल्बम)/, "music_streaming"],
  [/(பாடல்|இசை|பாடகர்)/, "music_streaming"], // Tamil: paadal, isai, paadagar
  [/(গান|সঙ্গীত|ফিল্ম)/, "music_streaming"], // Bengali: gaan, sangeet, film
  [/\b(song|music|singer|album|artist|bollywood|rapper|hiphop|spotify)\b/i, "music_streaming"],

  // Festivals — Diwali, Holi, Ganesh, Eid, religious/cultural events
  [/(दिवाली|होली|गणेश|उत्सव|त्योहार|ईद|नवरात्रि)/, "festivals"],
  [/(தீபாவளி|பஂகல்|விழா)/, "festivals"], // Tamil
  [/(দুর্গা|পূজা|উৎসব)/, "festivals"], // Bengali
  [/\b(festival|diwali|holi|ganesh|eid|navratri|onam|pongal|sankranti)\b/i, "festivals"],

  // Cricket — IPL, players, matches
  [/(क्रिकेट|आईपीएल|खिलाड़ी|विश्व कप)/, "cricket_watching"],
  [/(கிரிக்கெட்|ஐபிநுல்)/, "cricket_watching"], // Tamil
  [/(ক্রিকেট|আইপিএল)/, "cricket_watching"], // Bengali
  [/\b(cricket|ipl|t20|odi|kohli|rohit|dhoni|sachin)\b/i, "cricket_watching"],

  // Food / Restaurants
  [/(भोजन|खाना|रेस्टोरेंट|पकवान)/, "food_delivery"],
  [/(உணவு|உணவகம்)/, "food_delivery"], // Tamil
  [/(খাবার|রেস্টুরেঙ্ট)/, "food_delivery"], // Bengali
  [/\b(food|recipe|cuisine|biryani|paneer|dosa|tandoori|swiggy|zomato)\b/i, "food_delivery"],

  // Gaming
  [/\b(bgmi|free fire|gaming|esports|valorant)\b/i, "gaming_mobile"],

  // Fashion
  [/(फैशन|कपड़े)/, "fashion_sneakers"],
  [/\b(fashion|sneaker|streetwear|saree|kurta|lehenga)\b/i, "fashion_sneakers"],

  // Nightlife / late-night
  [/\b(bar|club|party|nightlife|rooftop)\b/i, "late_night_out"],
];

function classifyVernacular(title) {
  for (const [re, lens] of VERNACULAR_LENS_MAP) {
    if (re.test(title)) return lens;
  }
  return "cultural_explorer"; // honest catch-all for vernacular-only signal
}

// Wikipedia language editions to pull. Could expand to te (Telugu), mr
// (Marathi), gu (Gujarati), kn (Kannada), ml (Malayalam) — each free.
const LANGUAGE_WIKIS = [
  { code: "hi", language: "Hindi",   region: "North India",  city: "Delhi"  },
  { code: "ta", language: "Tamil",   region: "Tamil Nadu",   city: "Chennai" },
  { code: "bn", language: "Bengali", region: "West Bengal",  city: "Kolkata" },
];

async function fetchVernacularWiki({ code, language, region, city }) {
  try {
    // Most-read feed has a 1-day lag.
    const d = new Date(Date.now() - 24 * 36e5);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const url = `https://${code}.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${day}`;
    const r = await fetchWithTimeout(url);
    if (!r.ok) return [];
    const j = await r.json();
    const articles = (j?.mostread?.articles || []).slice(0, 15);
    const items = [];
    for (const a of articles) {
      const title = (a.normalizedtitle || a.titles?.normalized || a.title || "").trim();
      if (!title) continue;
      if (/^(deaths in|wikipedia|main page|special:|portal:)/i.test(title)) continue;
      const views = a.views || 0;
      // Vernacular signals get a slightly lower max lift than English ones
      // (volume is naturally smaller per language). But quality is higher
      // for India-cultural intelligence.
      const lift = Math.min(82, Math.max(45, Math.round(35 + Math.log10(views + 100) * 6)));
      items.push({
        query: title,
        cat: `Wikipedia ${language}`,
        lift,
        signal: classifyVernacular(title),
        city,
        source: "wiki_vernacular",
        language,
        region,
        url: `https://${code}.wikipedia.org/wiki/${encodeURIComponent((a.article || title).replace(/ /g, "_"))}`,
        views,
      });
      if (items.length >= 5) break;
    }
    return items;
  } catch {
    return [];
  }
}

export async function fetchVernacularWikipediaAll() {
  const batches = await Promise.all(LANGUAGE_WIKIS.map(fetchVernacularWiki));
  return batches.flat();
}

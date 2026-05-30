// api/sources-publishers.js
// ──────────────────────────────────────────────────────────────────────────────
// INDIAN PUBLISHER RSS FEEDS
//
// Direct RSS from Indian publishers' lifestyle/culture sections. Google News
// already aggregates many of these, but pulling directly gives us:
//   • lifestyle-specific framing (Mint Lounge ≠ Mint business)
//   • opinion writing (Scroll.in) — different lens than newswire
//   • literature/longform (Hindu Lit & Lounge)
//
// These add diversity on top of the Google News fetch — different editorial
// voice, different topic mix, same India context.
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
      headers: { "User-Agent": UA, "Accept": "application/rss+xml, application/xml, */*", ...(opts.headers || {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

// Each publisher RSS feed → primary signal lens it surfaces. Same lens
// taxonomy used elsewhere so the theme clusterer just works.
const PUBLISHERS = [
  {
    name: "NDTV Lifestyle",
    url: "https://feeds.feedburner.com/ndtvcooks-latest",
    lens: "food_delivery",
    city: "Mumbai",
    cat: "NDTV · food",
  },
  {
    name: "Hindustan Times Lifestyle",
    url: "https://www.hindustantimes.com/feeds/rss/lifestyle/rssfeed.xml",
    lens: "experience_maximiser",
    city: "Delhi",
    cat: "HT · lifestyle",
  },
  {
    name: "The Hindu — Lit & Lounge",
    url: "https://www.thehindu.com/news/feeder/default.rss",
    lens: "cultural_explorer",
    city: "Chennai",
    cat: "Hindu · culture",
  },
  {
    name: "Scroll.in",
    url: "https://feeds.feedburner.com/ScrollinArticles.rss",
    lens: "cultural_explorer",
    city: "Delhi",
    cat: "Scroll · opinion",
  },
];

// Parse a standard RSS item — works for FeedBurner-wrapped + raw RSS 2.0.
// Multiple date-field fallbacks because Indian publisher feeds aren't
// consistent: some use <pubDate>, some use <dc:date>, some <atom:published>.
function parsePublisherItem(block) {
  const t = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
  const l = block.match(/<link>([\s\S]*?)<\/link>/);
  const dateMatch =
    block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ||
    block.match(/<dc:date>([\s\S]*?)<\/dc:date>/) ||
    block.match(/<published>([\s\S]*?)<\/published>/) ||
    block.match(/<atom:published>([\s\S]*?)<\/atom:published>/);
  if (!t) return null;
  return {
    title: t[1].replace(/\s+/g, " ").trim(),
    link: l ? l[1].trim() : null,
    pub: dateMatch ? dateMatch[1].trim() : null,
  };
}

async function fetchPublisher({ name, url, lens, city, cat }) {
  try {
    const r = await fetchWithTimeout(url);
    if (!r.ok) return [];
    const xml = await r.text();
    const out = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) && out.length < 3) {
      const e = parsePublisherItem(m[1]);
      if (!e || !e.title) continue;
      // Parse date safely; if missing OR un-parseable, treat as "freshly
      // fetched" (0h) — the feed put it at the top so it's likely current.
      let hoursAgo = 0;
      if (e.pub) {
        const ts = Date.parse(e.pub);
        if (!Number.isNaN(ts)) hoursAgo = Math.max(0, (Date.now() - ts) / 36e5);
      }
      if (hoursAgo > 24 * 3) continue; // 3-day window — publishers churn fast
      const lift = Math.min(82, Math.max(35, Math.round(78 - hoursAgo * 0.5)));
      out.push({
        query: e.title.slice(0, 140),
        cat,
        lift,
        signal: lens,
        city,
        source: "publisher",
        publisher: name,
        url: e.link,
        hours_ago: Math.round(hoursAgo),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchPublishersAll() {
  const batches = await Promise.all(PUBLISHERS.map(fetchPublisher));
  return batches.flat();
}

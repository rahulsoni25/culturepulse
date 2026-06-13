// api/ask-router.js
// ──────────────────────────────────────────────────────────────────────────────
// ASK ROUTER — turns the dropdown selections into a targeted SOURCE PLAN.
//
// The old model fetched the same generic India signals from every source and
// then filtered. This routes the other way: the ask (brand + lens + location +
// keyword) decides WHICH sources to query and WHAT to ask them — so the signals
// that come back are genuinely about the ask and land in the right lens.
//
// deriveSourcePlan(ask) → {
//   newsQueries:  [{q, signal, city, cat}],   // targeted Google News searches
//   subreddits:   ["IndianGaming", ...],      // lens-relevant subreddits
//   lensKeys:     ["gaming_mobile", ...],      // the lenses this ask cares about
//   appleEmphasis:"music" | "apps" | "all",   // which Apple charts matter
//   label:        "Gaming + tech · Red Bull · Bangalore"
// }
// ──────────────────────────────────────────────────────────────────────────────

// Signal-Lens dropdown value → the lenses + the source-query vocabulary for it.
const LENS_PLAN = {
  "0": { // All signals — broad
    lensKeys: null,
    newsTerms: ["india culture", "india trending", "indian youth"],
    subLenses: null, // all subs
    apple: "all",
    name: "All signals",
  },
  "1": { // Music + festivals
    lensKeys: ["music_streaming", "festivals", "cultural_explorer"],
    newsTerms: ["indian music", "music festival india", "bollywood song", "indian rapper", "sunburn nh7 lollapalooza"],
    subLenses: ["music_streaming", "festivals", "cultural_explorer"],
    apple: "music",
    name: "Music + festivals",
  },
  "2": { // Gaming + tech
    lensKeys: ["gaming_mobile", "digital_expresser"],
    newsTerms: ["indian gaming", "bgmi esports india", "tech launch india", "smartphone india", "creator economy india"],
    subLenses: ["gaming_mobile", "digital_expresser"],
    apple: "apps",
    name: "Gaming + tech",
  },
  "3": { // Food + lifestyle
    lensKeys: ["food_delivery", "late_night_out", "experience_maximiser", "group_socialiser", "escapist_micro"],
    newsTerms: ["swiggy zomato india", "indian food trend", "nightlife india", "cafe culture india", "weekend india"],
    subLenses: ["food_delivery", "late_night_out"],
    apple: "apps",
    name: "Food + lifestyle",
  },
  "4": { // Fashion + identity
    lensKeys: ["fashion_sneakers", "social_identity", "digital_expresser"],
    newsTerms: ["indian streetwear", "sneaker india", "fashion india", "instagram reel india", "gen z identity india"],
    subLenses: ["fashion_sneakers", "social_identity", "digital_expresser"],
    apple: "all",
    name: "Fashion + identity",
  },
};

// Brand category → extra news vocabulary, so the brand itself targets sources.
// (Kept light — the brand name is always added directly too.)
const BRAND_CATEGORY_TERMS = [
  [/beer|lager|tuborg|heineken|kingfisher|bira|carlsberg|budweiser/i, ["beer india", "nightlife india"]],
  [/energy drink|red ?bull|monster|sting/i, ["energy drink india", "esports india"]],
  [/sneaker|nike|adidas|puma|footwear/i, ["sneaker india", "streetwear india"]],
  [/beauty|nykaa|skincare|cosmetic|mamaearth/i, ["beauty india", "skincare india"]],
  [/swiggy|zomato|blinkit|zepto|food/i, ["food delivery india", "quick commerce india"]],
  [/phone|oneplus|samsung|iphone|realme|nothing/i, ["smartphone launch india", "tech india"]],
  [/cricket|ipl|dream11/i, ["ipl cricket india", "cricket fan india"]],
];

const norm = (s) => String(s || "").toLowerCase().trim();

export function deriveSourcePlan(ask = {}) {
  const brandRaw = String(ask.brand || "").trim();
  const lensVal = String(ask.lens != null ? ask.lens : "0");
  const cityRaw = norm(ask.city);
  const city = (!cityRaw || /^all/.test(cityRaw) || cityRaw === "india") ? null : cityRaw;
  const keyword = String(ask.keyword || "").trim();

  const plan = LENS_PLAN[lensVal] || LENS_PLAN["0"];
  const cityTitle = city ? city.charAt(0).toUpperCase() + city.slice(1) : null;

  // ── Build targeted news queries from brand + lens + city + keyword ──────────
  const terms = new Set();
  // brand-specific (only if it looks like a real brand, not a generic word)
  const isGenericKeyword = brandRaw.split(/\s+/).length > 2 || brandRaw.length < 2;
  if (brandRaw && !isGenericKeyword) terms.add(`${brandRaw} india`);
  // brand category vocabulary
  for (const [re, t] of BRAND_CATEGORY_TERMS) if (re.test(brandRaw)) t.forEach((x) => terms.add(x));
  // lens vocabulary
  plan.newsTerms.forEach((t) => terms.add(t));
  // keyword (a culture concept typed in the box)
  if (keyword && keyword !== brandRaw) terms.add(`${keyword} india`);
  // Concept expansion: for a multi-word typed term (brand OR keyword) also
  // query each meaningful component, so "bhajan clubbing" actually fetches
  // "bhajan" + "clubbing india" signals instead of only the rare exact phrase.
  const STOP = new Set(["the","and","for","with","india","indian","of","in","a","an"]);
  const conceptWords = (keyword || brandRaw).toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (conceptWords.length >= 2) {
    conceptWords.slice(0, 3).forEach((w) => terms.add(`${w} india`));
  }

  // city-scoped variants — append the city to the strongest 3 terms
  const baseTerms = [...terms];
  const newsQueries = [];
  baseTerms.slice(0, 6).forEach((t) => {
    newsQueries.push({ q: t, signal: plan.lensKeys ? plan.lensKeys[0] : "cultural_explorer", city: cityTitle || "India", cat: "News" });
  });
  if (cityTitle) {
    // 2 city-specific queries so location genuinely pulls local signals
    const cityTermSrc = plan.newsTerms[0] || "culture";
    newsQueries.push({ q: `${cityTermSrc} ${cityTitle}`, signal: plan.lensKeys ? plan.lensKeys[0] : "cultural_explorer", city: cityTitle, cat: "News · local" });
    newsQueries.push({ q: `${cityTitle} ${plan.lensKeys ? "scene" : "culture"}`, signal: plan.lensKeys ? plan.lensKeys[0] : "cultural_explorer", city: cityTitle, cat: "News · local" });
  }

  return {
    newsQueries,
    lensKeys: plan.lensKeys,        // null = all lenses
    subLenses: plan.subLenses,      // null = all subreddits
    appleEmphasis: plan.apple,      // "music" | "apps" | "all"
    city: cityTitle,
    label: `${plan.name}${brandRaw ? " · " + brandRaw : ""}${cityTitle ? " · " + cityTitle : ""}`,
  };
}

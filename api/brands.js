// api/brands.js
// ──────────────────────────────────────────────────────────────────────────────
// CANONICAL BRAND PROFILES + INFERENCE ENGINE
//
// Single source of truth for brand cultural profiles. Used by drops.js,
// pulse-report.js and culture-score.js (replaces their duplicated weight maps).
//
// inferBrandProfile(input, signals) resolves ANY brand name or keyword to a
// profile via a layered, free-first strategy:
//   1. Known brand          → hand-built profile (highest quality)
//   2. Keyword → lens map    → infer weights from category words (free, instant)
//   3. Live-signal grounding → nudge weights toward lenses that show real signal
//   4. (future) Gemini       → full LLM profile when GEMINI_API_KEY is set
//
// So "Red Bull", "sneakers", "skincare", "Amul" all resolve to a usable
// cultural profile today, with no key required.
// ──────────────────────────────────────────────────────────────────────────────

const CORE_LENSES = [
  "music_streaming","festivals","late_night_out","food_delivery","gaming_mobile",
  "cricket_watching","fashion_sneakers","travel_weekend","digital_expresser","cultural_explorer",
];

// ── The 4 hand-built brands (preserved exactly) ─────────────────────────────
export const BRAND_PROFILES = {
  tuborg: {
    name: "Tuborg",
    positioning: "challenger lager · youth · music-led",
    weight: { music_streaming:1.6, festivals:1.5, late_night_out:1.4, food_delivery:1.2, gaming_mobile:1.1, fashion_sneakers:1.0, cricket_watching:0.7, digital_expresser:1.1, travel_weekend:1.0, cultural_explorer:1.1 },
    delivery_partner: "Zomato",
    music_partners: "rising indie / hip-hop artists (50K–500K)",
    festival_play: "Tier-2 stage activation · pre-headliner window",
    tone: "youthful, music-first, never product-led",
  },
  heineken: {
    name: "Heineken",
    positioning: "premium international · F1/football · aspirational",
    weight: { music_streaming:1.2, festivals:1.3, late_night_out:1.5, fashion_sneakers:1.4, travel_weekend:1.3, cricket_watching:0.9, food_delivery:1.0, gaming_mobile:1.0, digital_expresser:1.1, cultural_explorer:1.2 },
    delivery_partner: "Swiggy Instamart (premium SKU)",
    music_partners: "internationally-touring artists, EDM circuits",
    festival_play: "headline-sponsor positioning · F1 GP weekends",
    tone: "premium, globally connected, restrained",
  },
  kingfisher: {
    name: "Kingfisher",
    positioning: "mass-market lager · cricket-anchored · Indian heritage",
    weight: { cricket_watching:2.0, food_delivery:1.4, festivals:1.1, late_night_out:1.1, music_streaming:1.0, gaming_mobile:0.9, fashion_sneakers:0.7, travel_weekend:1.2, digital_expresser:0.9, cultural_explorer:0.9 },
    delivery_partner: "Swiggy",
    music_partners: "mass-market Bollywood playback artists",
    festival_play: "IPL match-day activation · viewing parties",
    tone: "warm, mass, cricket-anchored",
  },
  bira: {
    name: "Bira91",
    positioning: "craft challenger · urban Gen-Z · design-led",
    weight: { fashion_sneakers:1.7, music_streaming:1.4, festivals:1.3, digital_expresser:1.5, food_delivery:1.2, late_night_out:1.3, gaming_mobile:1.0, cricket_watching:0.6, travel_weekend:1.1, cultural_explorer:1.3 },
    delivery_partner: "Zomato + Swiggy (craft SKU placement)",
    music_partners: "indie-electronica, alt-hip-hop, Spotify-native artists",
    festival_play: "boutique festival presence · branded merch capsule",
    tone: "design-forward, ironic, urban",
  },
};

// ── Keyword → lens-weight contributions (Option A dictionary) ───────────────
// Each rule: a regex of brand / category terms → lens boosts. Multiple rules
// can match one input; their boosts accumulate, then we normalise.
// `meta` supplies the tailored positioning/partners for the synthesized profile.
const CATEGORY_RULES = [
  { re:/\b(beer|lager|ale|brew|tuborg|heineken|kingfisher|bira|budweiser|carlsberg|corona|stella)\b/i,
    boost:{ music_streaming:1.5, festivals:1.4, late_night_out:1.4, food_delivery:1.1 },
    meta:{ positioning:"beer · social · nightlife-led", partners:"music + nightlife creators", play:"festival + late-night activation", tone:"social, easy, music-first" } },
  { re:/\b(energy drink|red ?bull|monster|sting|gatorade|charged)\b/i,
    boost:{ gaming_mobile:1.7, late_night_out:1.4, music_streaming:1.3, festivals:1.3, cultural_explorer:1.2 },
    meta:{ positioning:"energy · high-stimulation · youth-extreme", partners:"esports + extreme-sport creators", play:"gaming tournaments + festival main-stage", tone:"high-energy, bold, always-on" } },
  { re:/\b(cola|soft drink|coke|coca.?cola|pepsi|thums ?up|sprite|fanta|limca)\b/i,
    boost:{ festivals:1.5, cricket_watching:1.5, food_delivery:1.3, music_streaming:1.2 },
    meta:{ positioning:"mass refreshment · cricket + festive", partners:"Bollywood + cricket faces", play:"IPL + festive-occasion campaigns", tone:"mass, joyful, occasion-led" } },
  { re:/\b(sneakers?|shoes?|footwear|nike|adidas|puma|reebok|campus|sketchers|crocs|yeezy|jordan)\b/i,
    boost:{ fashion_sneakers:1.9, digital_expresser:1.4, cultural_explorer:1.3, music_streaming:1.1 },
    meta:{ positioning:"footwear · streetwear · self-expression", partners:"sneakerheads + streetwear creators", play:"limited drops + hype seeding", tone:"hype, drop-culture, visual" } },
  { re:/\b(fashion|apparel|clothing|myntra|zara|h&m|uniqlo|levis|ajio|streetwear|thrift)\b/i,
    boost:{ fashion_sneakers:1.7, digital_expresser:1.5, cultural_explorer:1.3, social_identity:1.3 },
    meta:{ positioning:"fashion · identity · trend-led", partners:"fashion + lifestyle creators", play:"seasonal drops + reel formats", tone:"aesthetic, identity-forward" } },
  { re:/\b(beauty|skincare|cosmetic|makeup|nykaa|mamaearth|lakme|maybelline|loreal|sugar)\b/i,
    boost:{ digital_expresser:1.7, cultural_explorer:1.4, fashion_sneakers:1.2, social_identity:1.3 },
    meta:{ positioning:"beauty · routine · self-care", partners:"beauty + GRWM creators", play:"tutorial + routine content", tone:"intimate, aspirational, real" } },
  { re:/\b(food delivery|swiggy|zomato|eat|restaurant|cloud kitchen|biryani|pizza|domino)\b/i,
    boost:{ food_delivery:1.9, late_night_out:1.4, group_socialiser:1.3 },
    meta:{ positioning:"food · convenience · cravings", partners:"food + city creators", play:"late-night + occasion bundles", tone:"crave-led, fast, local" } },
  { re:/\b(quick commerce|blinkit|zepto|instamart|grocery|bigbasket|dunzo)\b/i,
    boost:{ food_delivery:1.8, late_night_out:1.3, digital_expresser:1.1 },
    meta:{ positioning:"quick-commerce · convenience-now", partners:"utility + meme creators", play:"10-minute occasion hooks", tone:"instant, witty, useful" } },
  { re:/\b(dairy|milk|amul|butter|cheese|nestle|britannia|chocolate|biscuit|snack)\b/i,
    boost:{ food_delivery:1.5, festivals:1.4, cricket_watching:1.3, group_socialiser:1.3 },
    meta:{ positioning:"FMCG food · family · everyday", partners:"family + food creators", play:"festive + cricket occasion", tone:"warm, family, trustworthy" } },
  { re:/\b(phone|smartphone|mobile|oneplus|samsung|apple|iphone|realme|xiaomi|vivo|oppo|nothing)\b/i,
    boost:{ gaming_mobile:1.6, digital_expresser:1.5, cultural_explorer:1.3, music_streaming:1.1 },
    meta:{ positioning:"tech · gaming + creation · spec-led", partners:"tech + gaming creators", play:"launch hype + creator seeding", tone:"sharp, spec-fluent, aspirational" } },
  { re:/\b(gaming|esports|bgmi|dream11|mpl|valorant|console|playstation|xbox)\b/i,
    boost:{ gaming_mobile:2.0, digital_expresser:1.3, cricket_watching:1.2 },
    meta:{ positioning:"gaming · competition · community", partners:"streamers + esports orgs", play:"tournament + watch-party", tone:"competitive, in-group, fast" } },
  { re:/\b(coffee|cafe|café|starbucks|blue tokai|third wave|chai|tea|barista)\b/i,
    boost:{ late_night_out:1.4, cultural_explorer:1.5, food_delivery:1.3, digital_expresser:1.2 },
    meta:{ positioning:"café culture · third-place · slow", partners:"café + lifestyle creators", play:"third-place + work-from-café", tone:"slow, aesthetic, discovery-led" } },
  { re:/\b(travel|trip|holiday|makemytrip|goibibo|airbnb|oyo|ixigo|tourism|getaway)\b/i,
    boost:{ travel_weekend:1.9, cultural_explorer:1.4, experience_maximiser:1.4, festivals:1.2 },
    meta:{ positioning:"travel · escape · experiences", partners:"travel + experience creators", play:"weekend-escape + festival-trip", tone:"wanderlust, experiential" } },
  { re:/\b(ott|streaming|netflix|hotstar|jiocinema|prime video|sony liv|zee5)\b/i,
    boost:{ digital_expresser:1.6, music_streaming:1.3, cricket_watching:1.4, cultural_explorer:1.2 },
    meta:{ positioning:"OTT · binge · fandom", partners:"film + fandom creators", play:"release-moment + watch-party", tone:"fandom-led, timely" } },
  { re:/\b(auto|bike|motorcycle|royal enfield|ola|ather|car|suv|tata motors|mahindra|hero|bajaj)\b/i,
    boost:{ travel_weekend:1.7, cultural_explorer:1.4, experience_maximiser:1.3 },
    meta:{ positioning:"mobility · freedom · journeys", partners:"travel + auto creators", play:"ride-culture + road-trip", tone:"freedom, adventure" } },
  { re:/\b(fintech|payment|paytm|phonepe|cred|groww|zerodha|upi|bank|credit card)\b/i,
    boost:{ digital_expresser:1.4, cultural_explorer:1.3, cricket_watching:1.2 },
    meta:{ positioning:"fintech · trust · everyday money", partners:"finance + meme creators", play:"reward + cricket-sponsor", tone:"clear, witty, trustworthy" } },
  { re:/\b(audio|headphone|earbuds|boat|jbl|sony|spotify|gaana|wynk|music app)\b/i,
    boost:{ music_streaming:1.9, digital_expresser:1.3, gaming_mobile:1.1 },
    meta:{ positioning:"audio · music-native · always-on", partners:"musicians + audio creators", play:"artist collabs + playlist drops", tone:"music-first, youthful" } },
];

const clampW = (n) => Math.max(0.5, Math.min(2.0, n));
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const titleCase = (s) => String(s || "").trim().split(/\s+/)
  .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(" ");

// Build a neutral baseline weight map.
function baseWeights() {
  const w = {}; CORE_LENSES.forEach((l) => (w[l] = 1.0)); return w;
}

// Convenience used by drops/culture-score (they only need weights).
export function getBrandWeights(input) {
  return inferBrandProfile(input).weight;
}

// ── The inference engine ────────────────────────────────────────────────────
export function inferBrandProfile(input, signals = null) {
  const raw = String(input || "").trim();
  const key = normKey(raw);
  const letters = raw.toLowerCase().replace(/[^a-z]/g, "");

  // 1) Known brand → hand-built profile.
  if (BRAND_PROFILES[key]) return { ...BRAND_PROFILES[key], inference_source: "known" };
  if (BRAND_PROFILES[letters]) return { ...BRAND_PROFILES[letters], inference_source: "known" };
  if (!raw) return { ...BRAND_PROFILES.tuborg, inference_source: "default" };

  // 2) Keyword → lens map.
  const weight = baseWeights();
  let matchedMeta = null;
  let matches = 0;
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(raw)) {
      matches++;
      if (!matchedMeta) matchedMeta = rule.meta; // first (strongest) match drives prose
      for (const [lens, boost] of Object.entries(rule.boost)) {
        if (CORE_LENSES.includes(lens)) weight[lens] = clampW(weight[lens] * boost);
      }
    }
  }

  // 3) Live-signal grounding — nudge toward lenses with real current signal.
  let signalSource = false;
  if (signals && signals.length) {
    const tokens = raw.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    const lensHits = {};
    signals.forEach((sg) => {
      const text = (sg.query || "").toLowerCase();
      if (tokens.some((t) => text.includes(t))) lensHits[sg.signal] = (lensHits[sg.signal] || 0) + 1;
    });
    const maxHit = Math.max(0, ...Object.values(lensHits));
    if (maxHit >= 2) {
      signalSource = true;
      for (const [lens, n] of Object.entries(lensHits)) {
        if (CORE_LENSES.includes(lens)) weight[lens] = clampW(weight[lens] * (1 + (n / maxHit) * 0.5));
      }
    }
  }

  const inferred = matches > 0 || signalSource;
  const src = matches > 0 && signalSource ? "keyword+signal" : matches > 0 ? "keyword" : signalSource ? "signal" : "generic";

  // Synthesize the profile. If nothing matched, fall back to youth-challenger.
  const m = matchedMeta || { positioning: "general · youth-challenger defaults", partners: "mid-tier creators (50K–200K)", play: "Tier-2 activation", tone: "neutral, youth-leaning" };
  if (!inferred) {
    weight.music_streaming = 1.3; weight.festivals = 1.2; weight.late_night_out = 1.2;
    weight.digital_expresser = 1.1; weight.cultural_explorer = 1.1;
  }

  return {
    name: titleCase(raw),
    positioning: m.positioning + (inferred ? "" : " [inferred from defaults]"),
    weight,
    delivery_partner: "delivery platform",
    music_partners: m.partners,
    festival_play: m.play,
    tone: m.tone,
    inference_source: src,
    inferred: true,
  };
}

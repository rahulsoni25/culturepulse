// api/cities.js
// ──────────────────────────────────────────────────────────────────────────────
// REGIONAL CULTURE PROFILES — location depth.
//
// Selecting a city doesn't just filter signals to that geography — it applies
// the city's own cultural character: which lenses run hot there, and a regional
// context line that frames the read. So Chennai surfaces Kollywood/Tamil music,
// Kolkata surfaces adda/football/Pujo, Mumbai surfaces Bollywood/nightlife —
// even from the same national signal pool.
//
// Used by drops.js: cityBias multiplies signal scores by the city's lens
// affinity, and cityContext is injected into the output so the user reads the
// culture *of that place*.
// ──────────────────────────────────────────────────────────────────────────────

export const CITY_CULTURE = {
  mumbai: {
    name: "Mumbai",
    context: "Bollywood gravity + relentless nightlife + street-food culture + startup hustle. Trends break here first and go national.",
    bias: { music_streaming:1.4, late_night_out:1.5, festivals:1.3, food_delivery:1.4, fashion_sneakers:1.2, digital_expresser:1.2, cultural_explorer:1.2 },
    signature: ["Bollywood + indie crossover", "late-night Bandra/Andheri scene", "street-food rituals", "sea-face hangouts"],
  },
  delhi: {
    name: "Delhi NCR",
    context: "Punjabi pop + big-night-out clubbing + street-fashion one-upmanship + political-cultural intensity. Loud, status-aware, trend-fast.",
    bias: { late_night_out:1.6, music_streaming:1.3, fashion_sneakers:1.5, festivals:1.3, food_delivery:1.3, social_identity:1.3 },
    signature: ["Punjabi/hip-hop nightlife", "Hauz Khas / CP / Aerocity circuits", "streetwear flexing", "café-hopping"],
  },
  bangalore: {
    name: "Bangalore",
    context: "Pub culture + indie/live-music scene + tech-creator overlap + craft food & coffee. India's discovery capital — niche before mainstream.",
    bias: { music_streaming:1.5, late_night_out:1.4, cultural_explorer:1.6, gaming_mobile:1.3, food_delivery:1.3, digital_expresser:1.3 },
    signature: ["indie live-music circuit", "microbrewery + pub culture", "third-wave coffee", "gaming/esports community"],
  },
  hyderabad: {
    name: "Hyderabad",
    context: "Tollywood star power + biryani identity + old-city heritage meeting HITEC-City new money. Film + food are the cultural anchors.",
    bias: { music_streaming:1.4, food_delivery:1.6, festivals:1.3, cricket_watching:1.3, digital_expresser:1.2, cultural_explorer:1.2 },
    signature: ["Tollywood release culture", "biryani as identity", "old-city Ramzan food", "tech-corridor lifestyle"],
  },
  chennai: {
    name: "Chennai",
    context: "Kollywood + Tamil music (Anirudh-era) + filter-coffee/temple tradition + a fierce regional-pride lens. Cinema is the cultural operating system.",
    bias: { music_streaming:1.6, festivals:1.3, cultural_explorer:1.4, food_delivery:1.3, cricket_watching:1.3, social_identity:1.3 },
    signature: ["Kollywood fandom", "Tamil indie + film music", "filter-coffee/temple rituals", "Marina/ECR weekend culture"],
  },
  kolkata: {
    name: "Kolkata",
    context: "Adda + Durga Pujo as the year's cultural peak + football passion + literary/arthouse pride. Intellectual, communal, intensely seasonal.",
    bias: { festivals:1.7, cultural_explorer:1.5, music_streaming:1.3, group_socialiser:1.4, food_delivery:1.2, late_night_out:1.1 },
    signature: ["Durga Pujo mega-moment", "adda + coffee-house culture", "East-Bengal/Mohun-Bagan football", "Bengali film + literature"],
  },
  pune: {
    name: "Pune",
    context: "Student-city energy + indie-festival heartland (NH7) + café-study culture + two-wheeler weekend escapes to the ghats.",
    bias: { festivals:1.6, music_streaming:1.4, cultural_explorer:1.4, late_night_out:1.3, travel_weekend:1.4, food_delivery:1.2 },
    signature: ["college-fest + indie-festival scene", "café-study culture", "Lonavla/ghats weekend trips", "live-music gigs"],
  },
};

const CITY_ALIASES = { blr: "bangalore", bengaluru: "bangalore", "delhi ncr": "delhi", gurgaon: "delhi", gurugram: "delhi", noida: "delhi" };

export function getCityCulture(cityName) {
  if (!cityName) return null;
  const c = String(cityName).toLowerCase().trim();
  if (c === "all" || c === "india" || c === "all india") return null;
  const key = CITY_ALIASES[c] || c;
  return CITY_CULTURE[key] || null;
}

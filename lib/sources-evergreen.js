// api/sources-evergreen.js
// ──────────────────────────────────────────────────────────────────────────────
// EVERGREEN SIGNAL POOL — the always-on backstop.
//
// When live web sources go thin or fail entirely (network outage, source
// rate-limit, niche brand × persona combo where Google News returns nothing),
// the reviewer can opt into this pool to keep the brief actionable.
//
// Every entry is CLEARLY MARKED with source: "evergreen" and a synthetic
// flag, so the freshness/quality agents and the UI never pretend evergreen
// signals are live web events. They're perennial India cultural truths
// useful for filling structural gaps — not breaking-news drops.
//
// Pool composition:
//   • Seasonal moments (IPL season, Diwali, Holi, Onam, Pongal, year-end)
//   • Long-running cultural patterns (Sunday cricket, monsoon nightlife,
//     late-night Swiggy, college fests, year-end house parties)
//   • Persona-relevant lifestyle staples (mom WhatsApp shares, Reels at 11pm,
//     gym + protein, weekend trek, paneer recipe Sunday)
//
// Lift is deliberately set in the 50-70 range — meaningful but never above
// genuine live signals, so live data always sorts higher when present.
// ──────────────────────────────────────────────────────────────────────────────

const NOW = () => new Date().toISOString();

// Each evergreen signal mirrors the shape the rest of the pipeline expects.
// `synthetic: true` is set so the agents can choose to weight these
// differently if needed; the source: "evergreen" flag is the primary tag.
function ever(query, signal, city, lift, theme) {
  return {
    query,
    cat: "Evergreen IN",
    lift,
    signal,
    city,
    source: "evergreen",
    synthetic: true,
    theme_hint: theme,
  };
}

export const EVERGREEN_POOL = [
  // ── Music & festival culture (year-round + spike-on-event) ──────────────────
  ever("Indie music scene at small-room venues in Bangalore & Mumbai",                "music_streaming",    "Mumbai", 62, "music_belonging"),
  ever("Spotify wrapped reveal week for college-going Indians",                       "music_streaming",    "Delhi",  58, "music_belonging"),
  ever("Bollywood-meets-indie crossover albums dropping monthly",                     "music_streaming",    "Mumbai", 60, "music_belonging"),
  ever("Underground hip-hop nights in Mumbai, Bangalore, Delhi",                      "music_streaming",    "Mumbai", 64, "discovery_culture"),
  ever("NH7 / Magnetic Fields / Sunburn / Ziro festival cycle",                       "festivals",          "Pune",   65, "festival_culture"),
  ever("College festival season — IIT Mood Indigo, Saarang, Goonj",                   "festivals",          "Mumbai", 60, "festival_culture"),
  ever("Holi house parties + Saturday-night EDM rotation",                            "festivals",          "Delhi",  58, "festival_culture"),
  ever("Karnataka monsoon music tours by indie collectives",                          "music_streaming",    "BLR",    52, "discovery_culture"),

  // ── Cricket & sport (perennial, with seasonal peaks) ────────────────────────
  ever("IPL season watch parties in metros and small towns",                          "cricket_watching",   "Mumbai", 70, "cricket_culture"),
  ever("India vs Pakistan + India vs Australia evening fixtures",                     "cricket_watching",   "Mumbai", 68, "cricket_culture"),
  ever("Local Sunday cricket clubs across cities",                                    "cricket_watching",   "BLR",    55, "cricket_culture"),
  ever("Pro Kabaddi League and ISL season viewing parties",                           "cricket_watching",   "Chennai",53, "cricket_culture"),

  // ── Late-night, food, social rituals ────────────────────────────────────────
  ever("Late-night Swiggy + Zomato ordering between 10pm and 2am",                    "food_delivery",      "Mumbai", 65, "intimate_gatherings"),
  ever("Sunday biryani delivery in metros",                                           "food_delivery",      "Hyderabad", 60, "intimate_gatherings"),
  ever("Board game / card game / poker nights in metros",                             "late_night_out",     "BLR",    58, "intimate_gatherings"),
  ever("Listening parties for new album drops in living rooms",                       "late_night_out",     "Mumbai", 56, "intimate_gatherings"),
  ever("Friday night rooftop bar rotation in Pune, BLR, Bombay",                      "late_night_out",     "Pune",   60, "intimate_gatherings"),
  ever("College-going Gen Z 11pm-onwards Reels marathon",                             "digital_expresser",  "Delhi",  55, "curated_real"),

  // ── Performance fatigue / micro-escape (under-served lens) ──────────────────
  ever("Burnout-recovery content + 'doing nothing' aesthetic on Insta",               "escapist_micro",     "Mumbai", 60, "performance_relief"),
  ever("BGMI / Valorant evening squads with college groups",                          "gaming_mobile",      "BLR",    58, "performance_relief"),
  ever("Walking + audiobook morning ritual in metros",                                "escapist_micro",     "BLR",    54, "performance_relief"),
  ever("Yoga + breathwork apps gaining steady traction",                              "escapist_micro",     "Pune",   52, "performance_relief"),

  // ── Fashion & identity ──────────────────────────────────────────────────────
  ever("Sneaker drops + limited resell circuits in Mumbai/Delhi",                     "fashion_sneakers",   "Mumbai", 58, "scene_individual"),
  ever("Thrifted streetwear scene growing in college towns",                          "fashion_sneakers",   "BLR",    55, "scene_individual"),
  ever("Designer-collab capsule launches around Diwali / NYE",                        "fashion_sneakers",   "Mumbai", 56, "scene_individual"),

  // ── Travel & exploration ────────────────────────────────────────────────────
  ever("Goa long-weekend trips remain the metro default",                             "travel_weekend",     "Mumbai", 60, "fomo_genuine"),
  ever("Himachal / Ladakh / NE bike trips by young professionals",                    "travel_weekend",     "Delhi",  58, "fomo_genuine"),
  ever("Café-hopping trips to Mahabaleshwar / Coorg / Lonavla",                       "travel_weekend",     "Pune",   54, "fomo_genuine"),

  // ── Family-led patterns (for moms personas) ─────────────────────────────────
  ever("WhatsApp family group video shares around festivals",                         "group_socialiser",   "Mumbai", 60, "intimate_gatherings"),
  ever("Sunday lunch rituals — Sambar / Rajma / Mutton curry rotation",               "food_delivery",      "Chennai",55, "intimate_gatherings"),
  ever("Children's school admission and exam-prep WhatsApp discussion",               "group_socialiser",   "Mumbai", 52, "intimate_gatherings"),
  ever("Saas-bahu prime-time TV viewing in T2/T3 households",                         "group_socialiser",   "Lucknow",50, "intimate_gatherings"),

  // ── Year-round festive cycle ────────────────────────────────────────────────
  ever("Diwali shopping + sweet/snack hampers in October-November",                   "festivals",          "Mumbai", 65, "festival_culture"),
  ever("Onam / Pongal / Eid family gathering food preparation",                       "festivals",          "Kochi",  60, "festival_culture"),
  ever("Christmas + New Year house parties in metros",                                "late_night_out",     "Mumbai", 62, "intimate_gatherings"),
  ever("Republic Day / Independence Day brand activations",                           "festivals",          "Delhi",  55, "festival_culture"),
];

// Filter by persona — every evergreen signal applies broadly, but some are
// tighter to specific personas. We tag with lens weight via signal mapping
// (already covered by persona behavioural.weights), so the persona-fit
// happens naturally downstream.
//
// `themes` arg lets the orchestrator request only items for thin themes.
export function fetchEvergreen({ themes = null, limit = 20 } = {}) {
  let pool = EVERGREEN_POOL.slice();
  if (themes && themes.length) {
    pool = pool.filter((p) => themes.includes(p.theme_hint));
  }
  // Light shuffle so different runs surface different evergreen items.
  pool.sort(() => Math.random() - 0.5);
  return pool.slice(0, limit).map((p) => ({ ...p, fetched_at: NOW(), hours_ago: 0 }));
}

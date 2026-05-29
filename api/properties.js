// api/properties.js
// ──────────────────────────────────────────────────────────────────────────────
// CURATED PROPERTY / BRAND LIBRARY  (Level 3 of the Culture Drop hierarchy)
//
// These are the activation candidates a brand planner can plug into. Each
// entry is tagged with:
//   • theme_keys      — which Level-1 macro themes it fits
//   • lens_keys       — which signal lenses it expresses (music_streaming, etc.)
//   • persona_keys    — which personas it's relevant for
//   • brand_fit       — per-brand affinity (0-1); only brands listed
//   • type            — festival | property | platform | content | venue | community
//
// Level-3 ranking at runtime:
//   final_score = property.brand_fit[brand]
//                 × persona_alignment_score(property, persona)
//                 × live_signal_boost(property, signals)     // small bump if a
//                                                            // signal references it
// ──────────────────────────────────────────────────────────────────────────────

export const PROPERTIES = [
  // ── FESTIVALS / MUSIC PROPERTIES ────────────────────────────────────────────
  {
    id: "nh7_weekender",
    name: "NH7 Weekender",
    type: "festival",
    theme_keys: ["music_belonging", "festival_culture", "discovery_culture"],
    lens_keys: ["festivals", "music_streaming", "cultural_explorer"],
    persona_keys: ["urban_gen_z", "millennials_urban"],
    brand_fit: { tuborg: 0.85, heineken: 0.7, kingfisher: 0.5, bira91: 0.8 },
    activation_note: "Pre-headliner window on side stage — discovery slot, not the closer.",
    city_anchors: ["Pune", "Mumbai", "BLR"],
  },
  {
    id: "sunburn",
    name: "Sunburn Festival",
    type: "festival",
    theme_keys: ["festival_culture", "fomo_genuine", "music_belonging"],
    lens_keys: ["festivals", "music_streaming", "experience_maximiser"],
    persona_keys: ["urban_gen_z", "millennials_urban"],
    brand_fit: { tuborg: 0.7, heineken: 0.85, kingfisher: 0.4, bira91: 0.6 },
    activation_note: "EDM-leaning; premium positioning fits Heineken cleanest.",
    city_anchors: ["Goa", "Pune"],
  },
  {
    id: "lollapalooza_in",
    name: "Lollapalooza India",
    type: "festival",
    theme_keys: ["music_belonging", "festival_culture"],
    lens_keys: ["festivals", "music_streaming"],
    persona_keys: ["urban_gen_z", "millennials_urban"],
    brand_fit: { tuborg: 0.8, heineken: 0.85, kingfisher: 0.5, bira91: 0.75 },
    activation_note: "Mainstream-international lineup. Discovery-stage sponsorship is the open lane.",
    city_anchors: ["Mumbai"],
  },
  {
    id: "magnetic_fields",
    name: "Magnetic Fields Festival",
    type: "festival",
    theme_keys: ["discovery_culture", "music_belonging", "intimate_gatherings"],
    lens_keys: ["festivals", "cultural_explorer", "music_streaming"],
    persona_keys: ["urban_gen_z"],
    brand_fit: { tuborg: 0.7, heineken: 0.6, kingfisher: 0.2, bira91: 0.95 },
    activation_note: "Boutique, design-led, low-thousands attendance. The taste-maker play.",
    city_anchors: ["Alsisar (Rajasthan)"],
  },
  {
    id: "ziro_festival",
    name: "Ziro Festival of Music",
    type: "festival",
    theme_keys: ["discovery_culture", "music_belonging"],
    lens_keys: ["festivals", "cultural_explorer"],
    persona_keys: ["urban_gen_z"],
    brand_fit: { tuborg: 0.55, heineken: 0.4, kingfisher: 0.2, bira91: 0.85 },
    activation_note: "Indie-folk, NE-anchored. Strongest cultural-credit play but small reach.",
    city_anchors: ["Arunachal Pradesh"],
  },

  // ── DRINKS / NIGHTLIFE CONTENT PROPERTIES ───────────────────────────────────
  {
    id: "social_offline_house_party",
    name: "Social offline house-party",
    type: "venue",
    theme_keys: ["intimate_gatherings", "music_belonging"],
    lens_keys: ["late_night_out", "group_socialiser"],
    persona_keys: ["urban_gen_z", "millennials_urban"],
    brand_fit: { tuborg: 0.9, heineken: 0.5, kingfisher: 0.8, bira91: 0.85 },
    activation_note: "SOCIAL outlets, late-night themes — co-program a 'house party' content series.",
    city_anchors: ["all metros"],
  },
  {
    id: "blr_indie_circuit",
    name: "BLR indie circuit (Fandry, The Humming Tree, Bflat)",
    type: "venue",
    theme_keys: ["discovery_culture", "music_belonging"],
    lens_keys: ["music_streaming", "late_night_out", "cultural_explorer"],
    persona_keys: ["urban_gen_z"],
    brand_fit: { tuborg: 0.8, heineken: 0.4, kingfisher: 0.3, bira91: 0.85 },
    activation_note: "Sub-200-cap rooms — own the discovery night, not the headliner.",
    city_anchors: ["BLR"],
  },

  // ── BOARD GAMES / INTIMATE GATHERINGS ───────────────────────────────────────
  {
    id: "game_theory_cafe",
    name: "Game Theory boardgame cafés",
    type: "venue",
    theme_keys: ["intimate_gatherings", "performance_relief"],
    lens_keys: ["group_socialiser", "escapist_micro"],
    persona_keys: ["urban_gen_z", "millennials_urban"],
    brand_fit: { tuborg: 0.7, heineken: 0.5, kingfisher: 0.5, bira91: 0.6 },
    activation_note: "Co-host weekend tournaments. Branded house-rules deck = high earned reach.",
    city_anchors: ["BLR", "Mumbai", "Pune"],
  },
  {
    id: "boardwalk_in",
    name: "Boardwalk (board game retailer + nights)",
    type: "platform",
    theme_keys: ["intimate_gatherings"],
    lens_keys: ["group_socialiser", "escapist_micro"],
    persona_keys: ["urban_gen_z", "millennials_urban"],
    brand_fit: { tuborg: 0.6, heineken: 0.4, kingfisher: 0.5, bira91: 0.55 },
    activation_note: "Co-branded starter kit (cards + house rules + 6-pack pairing).",
    city_anchors: ["pan-India"],
  },

  // ── DELIVERY / COMMERCE PLATFORMS ───────────────────────────────────────────
  {
    id: "zomato_late_night",
    name: "Zomato late-night order bundles",
    type: "platform",
    theme_keys: ["intimate_gatherings", "performance_relief", "music_belonging"],
    lens_keys: ["food_delivery", "late_night_out"],
    persona_keys: ["urban_gen_z", "millennials_urban", "working_professionals"],
    brand_fit: { tuborg: 0.9, heineken: 0.6, kingfisher: 0.7, bira91: 0.85 },
    activation_note: "House-party bundle SKUs — order food + drinks for groups of 4-6.",
    city_anchors: ["metros"],
  },
  {
    id: "swiggy_instamart",
    name: "Swiggy Instamart (premium SKUs)",
    type: "platform",
    theme_keys: ["intimate_gatherings", "music_belonging"],
    lens_keys: ["food_delivery"],
    persona_keys: ["urban_gen_z", "millennials_urban"],
    brand_fit: { tuborg: 0.7, heineken: 0.9, kingfisher: 0.85, bira91: 0.75 },
    activation_note: "10-minute delivery placement during prime-time IPL match windows.",
    city_anchors: ["metros"],
  },
  {
    id: "bookmyshow_events",
    name: "BookMyShow event funnels",
    type: "platform",
    theme_keys: ["festival_culture", "music_belonging", "fomo_genuine"],
    lens_keys: ["festivals", "experience_maximiser"],
    persona_keys: ["urban_gen_z", "millennials_urban"],
    brand_fit: { tuborg: 0.7, heineken: 0.75, kingfisher: 0.6, bira91: 0.7 },
    activation_note: "Pre-event 'plan your night' content + post-event drink-bundle CTA.",
    city_anchors: ["pan-India"],
  },

  // ── CONTENT / IP PROPERTIES ─────────────────────────────────────────────────
  {
    id: "spotify_radar",
    name: "Spotify RADAR India",
    type: "platform",
    theme_keys: ["discovery_culture", "music_belonging", "scene_individual"],
    lens_keys: ["music_streaming", "cultural_explorer"],
    persona_keys: ["urban_gen_z"],
    brand_fit: { tuborg: 0.85, heineken: 0.7, kingfisher: 0.45, bira91: 0.85 },
    activation_note: "Sponsor the next emerging-artist cohort. Discovery is the brief.",
    city_anchors: ["national"],
  },
  {
    id: "ipl_watch_parties",
    name: "IPL watch-party network",
    type: "content",
    theme_keys: ["cricket_culture", "fomo_genuine"],
    lens_keys: ["cricket_watching", "group_socialiser"],
    persona_keys: ["urban_gen_z", "millennials_urban", "working_professionals"],
    brand_fit: { tuborg: 0.5, heineken: 0.5, kingfisher: 0.95, bira91: 0.45 },
    activation_note: "Anchor brand for in-home + bar viewing. Kingfisher's home turf.",
    city_anchors: ["all"],
  },
  {
    id: "divine_drop_nights",
    name: "DIVINE / Hanumankind drop nights",
    type: "content",
    theme_keys: ["music_belonging", "scene_individual"],
    lens_keys: ["music_streaming", "social_identity"],
    persona_keys: ["urban_gen_z"],
    brand_fit: { tuborg: 0.85, heineken: 0.65, kingfisher: 0.3, bira91: 0.7 },
    activation_note: "Co-sponsored album drop listening parties in 5 metros.",
    city_anchors: ["Mumbai", "Delhi", "BLR"],
  },
  {
    id: "f1_gp_weekends",
    name: "F1 GP weekend viewing events",
    type: "content",
    theme_keys: ["fomo_genuine", "discovery_culture"],
    lens_keys: ["experience_maximiser", "group_socialiser"],
    persona_keys: ["millennials_urban", "working_professionals"],
    brand_fit: { tuborg: 0.4, heineken: 0.95, kingfisher: 0.3, bira91: 0.5 },
    activation_note: "Heineken's global IP. F1 weekend co-viewing in premium bars.",
    city_anchors: ["metros"],
  },

  // ── FASHION / STREETWEAR ────────────────────────────────────────────────────
  {
    id: "sneaker_drop_india",
    name: "Sneaker drop India network (HypeFly, etc.)",
    type: "community",
    theme_keys: ["scene_individual", "discovery_culture"],
    lens_keys: ["fashion_sneakers", "social_identity", "digital_expresser"],
    persona_keys: ["urban_gen_z"],
    brand_fit: { tuborg: 0.5, heineken: 0.5, kingfisher: 0.2, bira91: 0.85 },
    activation_note: "Limited collab drop (50-200 units). Object-as-signal play.",
    city_anchors: ["Mumbai", "Delhi", "BLR"],
  },

  // ── GAMING ──────────────────────────────────────────────────────────────────
  {
    id: "esports_india_circuit",
    name: "Esports India circuit (BGMI / Valorant)",
    type: "content",
    theme_keys: ["performance_relief", "scene_individual"],
    lens_keys: ["gaming_mobile", "digital_expresser"],
    persona_keys: ["urban_gen_z"],
    brand_fit: { tuborg: 0.6, heineken: 0.5, kingfisher: 0.4, bira91: 0.55 },
    activation_note: "10pm gaming + delivery combo. Beer pairs with the controller, not the screen.",
    city_anchors: ["BLR", "Hyderabad", "Pune"],
  },

  // ── DESIGN / CRAFT ──────────────────────────────────────────────────────────
  {
    id: "design_id_circuit",
    name: "Design × ID Mumbai / India Design ID",
    type: "content",
    theme_keys: ["scene_individual", "curated_real"],
    lens_keys: ["fashion_sneakers", "cultural_explorer"],
    persona_keys: ["urban_gen_z", "millennials_urban"],
    brand_fit: { tuborg: 0.4, heineken: 0.55, kingfisher: 0.15, bira91: 0.95 },
    activation_note: "Boutique craft / design-week sponsorship. Bira's natural home.",
    city_anchors: ["Mumbai", "Delhi"],
  },
];

// ── Level-1 themes the library is tagged against ───────────────────────────
// Each theme also has a short descriptor for the UI.
export const THEMES = {
  intimate_gatherings: {
    key: "intimate_gatherings",
    name: "Intimate social gatherings",
    description: "Shift from large public events to small private rituals with chosen people.",
    lenses: ["late_night_out", "group_socialiser", "escapist_micro"],
  },
  music_belonging: {
    key: "music_belonging",
    name: "Music as belonging",
    description: "Music isn't background; it's tribal signal. Indie/hip-hop scenes as identity markers.",
    lenses: ["music_streaming", "festivals", "cultural_explorer"],
  },
  discovery_culture: {
    key: "discovery_culture",
    name: "Discovery before hype",
    description: "Status currency = 'I found it before it blew up.' The pre-mainstream window.",
    lenses: ["cultural_explorer", "music_streaming", "fashion_sneakers"],
  },
  performance_relief: {
    key: "performance_relief",
    name: "Performance fatigue → permission to switch off",
    description: "Public-self exhaustion driving demand for unmediated, low-stakes time.",
    lenses: ["escapist_micro", "group_socialiser", "gaming_mobile"],
  },
  scene_individual: {
    key: "scene_individual",
    name: "Scene belonging vs. individual identity",
    description: "Belong to the tribe AND signal you're not interchangeable within it.",
    lenses: ["social_identity", "fashion_sneakers", "digital_expresser"],
  },
  festival_culture: {
    key: "festival_culture",
    name: "Festival culture",
    description: "Live music attendance + side-stage discovery + pre-headliner ritual.",
    lenses: ["festivals", "experience_maximiser", "music_streaming"],
  },
  curated_real: {
    key: "curated_real",
    name: "Curated self vs. real self",
    description: "Polished feeds losing to authentic-looking content. Aesthetic is splitting.",
    lenses: ["digital_expresser", "social_identity"],
  },
  fomo_genuine: {
    key: "fomo_genuine",
    name: "FOMO vs. genuine experience",
    description: "Attending the event vs. having the experience. The 90-min before the headliner.",
    lenses: ["festivals", "experience_maximiser", "travel_weekend"],
  },
  cricket_culture: {
    key: "cricket_culture",
    name: "The room, not the stadium",
    description: "Cricket viewing as collective ritual — the watch party, not the broadcast.",
    lenses: ["cricket_watching", "group_socialiser"],
  },
};

// Helper: rank properties for a (brand, persona, signals) trio.
export function rankProperties({ brand, personaKey, themeKey, signals = [], limit = 4 }) {
  const brandKey = String(brand || "").toLowerCase().replace(/[^a-z]/g, "");
  // Live-signal boost: properties whose city_anchors / lens_keys match top
  // live signals get a small lift, so the library stays grounded in reality.
  const liveLensMix = {};
  signals.forEach((s) => {
    liveLensMix[s.signal] = (liveLensMix[s.signal] || 0) + (s.lift || 0);
  });
  const maxLensMix = Math.max(1, ...Object.values(liveLensMix));

  return PROPERTIES
    .filter((p) => !themeKey || p.theme_keys.includes(themeKey))
    .filter((p) => !personaKey || p.persona_keys.includes(personaKey))
    .map((p) => {
      const fit = (p.brand_fit?.[brandKey]) ?? 0.4;
      const liveBoost = p.lens_keys.reduce(
        (sum, k) => sum + ((liveLensMix[k] || 0) / maxLensMix) * 0.15,
        0
      );
      return { ...p, score: +(fit + liveBoost).toFixed(3) };
    })
    .filter((p) => p.score > 0.3) // drop genuinely bad fits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// api/drops.js
// ──────────────────────────────────────────────────────────────────────────────
// /api/drops — 3-level Culture Drops with expanded tensions
//
// Input (query params):
//   ?brand=Tuborg
//   ?persona=urban_gen_z
//
// Output:
//   {
//     ok: true,
//     brand, persona,
//     generated_at,
//     drops: [
//       {
//         level_1: { key, name, description },
//         lift_score,                          // total lift behind this theme
//         level_2: [                            // 2-4 specific manifestations from live signals
//           { name, evidence: {query, lift, source, url}, lens }
//         ],
//         level_3: [                            // 2-4 ranked property/brand candidates
//           { id, name, type, score, activation_note, city_anchors }
//         ],
//         tension: {
//           statement,
//           proof_point,                        // live-signal-derived stat
//           reasoning                            // the cultural "why"
//         }
//       }
//     ],
//     review: { freshness, quality }            // same two agents run on every output
//   }
// ──────────────────────────────────────────────────────────────────────────────

import { buildSignals } from "./signals.js";
import { getPersona } from "./personas.js";
import { THEMES, rankProperties } from "./properties.js";
import { runFreshnessAgent } from "./agent-freshness.js";
import { runReviewerAgent }   from "./agent-reviewer.js";
import { applyFilters }       from "./filters.js";
import { scoreTheme }         from "./culture-score.js";
import { inferBrandProfileAsync } from "./brands.js";

function brandKey(b) { return String(b || "tuborg").toLowerCase().replace(/[^a-z]/g, ""); }
function titleCase(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

// Compute the persona × brand weighted score for one signal.
// brandWeight is the inferred profile's weight map (works for ANY brand/keyword).
function scored(signal, persona, brandWeight) {
  const lift = signal.lift || 0;
  const personaW = persona.behavioural?.weights?.[signal.signal] ?? 1;
  const brandW   = (brandWeight && brandWeight[signal.signal]) ?? 1;
  return { ...signal, score: lift * personaW * brandW };
}

// ── FOCUS RESHAPING ─────────────────────────────────────────────────────────
// When the user types a culture concept/keyword ("bhajan clubbing", "sober
// raves"), refocus the whole signal pool on it: boost signals that match the
// phrase (by text token OR cultural-lens hint), dampen the rest — so the
// surfaced themes/scores reorganise around what was typed. Graceful: if too
// few signals match (e.g. the input is just a brand name), it does nothing.
const FOCUS_LENS_HINTS = [
  [/bhajan|devotional|kirtan|temple|spiritual|sufi|qawwali|aarti/i, ["music_streaming","cultural_explorer","festivals"]],
  [/club|rave|party|nightlife|techno|edm|\bdj\b|rooftop|pub|bar/i, ["late_night_out","music_streaming"]],
  [/festival|concert|gig|lineup|tour|sunburn|nh7|lollapalooza/i, ["festivals","music_streaming"]],
  [/sneaker|streetwear|thrift|drip|outfit|fashion|fit\b/i, ["fashion_sneakers","social_identity","digital_expresser"]],
  [/food|biryani|cafe|swiggy|zomato|dining|street ?food|midnight/i, ["food_delivery","late_night_out"]],
  [/cricket|ipl|match|stadium|kabaddi/i, ["cricket_watching"]],
  [/gaming|bgmi|esports|valorant|stream/i, ["gaming_mobile","digital_expresser"]],
  [/reel|insta|aesthetic|viral|meme|content|grwm/i, ["digital_expresser","social_identity"]],
  [/indie|underground|discovery|emerging|niche|hip.?hop|rap/i, ["cultural_explorer","music_streaming"]],
  [/sober|wellness|mindful|calm|slow|chill|burnout|switch.?off/i, ["escapist_micro","cultural_explorer"]],
  [/travel|trip|getaway|goa|trek|weekend|roadtrip/i, ["travel_weekend"]],
];
function focusLenses(q) {
  const out = new Set();
  for (const [re, lenses] of FOCUS_LENS_HINTS) if (re.test(q)) lenses.forEach((l) => out.add(l));
  return out;
}
function applyFocus(signals, focusText) {
  const q = String(focusText || "").toLowerCase().trim();
  if (!q || q.length < 3) return { signals, applied: false, matched: 0 };
  const tokens = q.split(/[^a-z0-9ऀ-ॿ஀-௿]+/i).filter((t) => t.length > 2);
  const lenses = focusLenses(q);
  let textMatched = 0, lensMatched = 0;
  const out = signals.map((s) => {
    const text = (s.query || "").toLowerCase();
    const textHit = tokens.some((t) => text.includes(t));   // literal mention of what was typed
    const lensHit = lenses.has(s.signal);                    // same broad cultural lane
    // Literal text matches are the real signal — weight them far above a mere
    // lens-category match, so a specific concept surfaces its actual evidence
    // rather than drowning in the whole music/nightlife pool.
    let mult;
    if (textHit)      { mult = 3.6; textMatched++; }
    else if (lensHit) { mult = 1.25; lensMatched++; }
    else              { mult = 0.45; }
    return { ...s, score: s.score * mult, _focus_hit: textHit || lensHit, _focus_text: textHit };
  });
  const matched = textMatched + lensMatched;
  // Reshape ONLY when the concept literally appears in live signals
  // (textMatched ≥ 2). Pure lens-category overlap isn't a real reshape — it
  // just re-ranks the same broad pool. Be honest about which case it is.
  if (textMatched >= 2) {
    return { signals: out, applied: true, matched, textMatched, note: null };
  }
  // Concept not (or barely) present in the live feed → don't fake a reshape.
  const note = lensMatched >= 4
    ? `“${focusText}” isn't surfacing as a distinct signal in the live feed yet — showing the closest adjacent cultures (${[...lenses].slice(0,3).join(", ")}). Treat it as an emerging bet, not a measured trend.`
    : `“${focusText}” has no live-signal footprint right now — this is an emerging / niche concept. Showing the brand's strongest current cultures instead.`;
  return { signals, applied: false, matched, textMatched, note };
}

// Cluster live signals into Level-1 themes. Each theme has `lenses` declared
// in properties.js → we sum the brand-weighted lifts of signals whose
// `signal.signal` matches one of those lenses.
function clusterIntoThemes(signals) {
  const themeAgg = {};
  for (const tk of Object.keys(THEMES)) {
    themeAgg[tk] = { lift_total: 0, signals: [] };
  }
  for (const s of signals) {
    for (const tk of Object.keys(THEMES)) {
      if (THEMES[tk].lenses.includes(s.signal)) {
        themeAgg[tk].lift_total += s.score;
        themeAgg[tk].signals.push(s);
      }
    }
  }
  return themeAgg;
}

// Build Level-2 manifestations from the top live signals in a theme.
// Each signal becomes a "specific manifestation" — its raw query is the
// evidence. We dedupe by signal lens so we get variety not 4 music items.
function buildLevel2(themeSignals, max = 4) {
  // Sort first; we'll do TWO passes — variety first, then fill remaining
  // slots with any high-score signal regardless of lens.
  const sorted = themeSignals.slice().sort((a, b) => b.score - a.score);
  const seenLens = new Set();
  const out = [];

  // Pass 1: prefer lens variety. Take the top signal per distinct lens.
  for (const s of sorted) {
    if (seenLens.has(s.signal)) continue;
    seenLens.add(s.signal);
    out.push(asL2(s));
    if (out.length >= max) break;
  }

  // Pass 2: fill remaining slots from the sorted pool, even if lens repeats.
  if (out.length < max) {
    const used = new Set(out.map((l) => l.evidence.query));
    for (const s of sorted) {
      if (used.has(s.query)) continue;
      out.push(asL2(s));
      if (out.length >= max) break;
    }
  }

  return out;
}

function asL2(s) {
  return {
    name: titleCase((s.query || "").slice(0, 80)),
    lens: s.signal,
    evidence: {
      query: s.query,
      lift: s.lift,
      source: s.source,
      city: s.city,
      url: s.url || null,
      hours_ago: s.hours_ago,
    },
  };
}

// Fill a tension proof-point template using counts/top-signal references.
// Template tokens:
//   {{count.<lens>}}                         → integer count of signals in that lens
//   {{count.escapist_micro_or_late_night}}   → sum of two lenses (alias used in one tension)
//   {{top.<lens>.query}}                     → top signal in lens, query text
//   {{top.<lens>.lift}}                      → top signal in lens, lift
//   {{top.escapist_or_night.query}}          → top across the two lenses
function fillProofPoint(template, signals) {
  if (!template) return "";
  const byLens = {};
  signals.forEach((s) => {
    (byLens[s.signal] ||= []).push(s);
  });
  Object.values(byLens).forEach((arr) => arr.sort((a, b) => b.score - a.score));

  const counts = {};
  Object.keys(byLens).forEach((k) => (counts[k] = byLens[k].length));
  counts.escapist_micro_or_late_night = (counts.escapist_micro || 0) + (counts.late_night_out || 0);
  // Friendly aliases used in proof-point templates.
  counts.music         = counts.music_streaming  || 0;
  counts.night         = counts.late_night_out   || 0;
  counts.fest          = counts.festivals        || 0;
  counts.food          = counts.food_delivery    || 0;
  counts.gaming        = counts.gaming_mobile    || 0;
  counts.cricket       = counts.cricket_watching || 0;
  counts.aesthetics    = counts.digital_expresser|| 0;

  const top = {};
  Object.keys(byLens).forEach((k) => (top[k] = byLens[k][0]));
  // Friendly aliases mirroring the count aliases.
  top.music         = byLens.music_streaming?.[0];
  top.night         = byLens.late_night_out?.[0];
  top.fest          = byLens.festivals?.[0];
  top.gaming        = byLens.gaming_mobile?.[0];
  top.aesthetics    = byLens.digital_expresser?.[0];
  // alias for the "switch off" tension
  top.escapist_or_night =
    (byLens.escapist_micro?.[0] && byLens.late_night_out?.[0]
      ? (byLens.escapist_micro[0].score >= byLens.late_night_out[0].score
          ? byLens.escapist_micro[0]
          : byLens.late_night_out[0])
      : (byLens.escapist_micro?.[0] || byLens.late_night_out?.[0] || signals[0]));

  return template
    .replace(/{{count\.([a-z_]+)}}/gi, (_, lens) => String(counts[lens] || 0))
    .replace(/{{top\.([a-z_]+)\.query}}/gi, (_, lens) => (top[lens]?.query || "—").slice(0, 80))
    .replace(/{{top\.([a-z_]+)\.lift}}/gi, (_, lens) => String(top[lens]?.lift || 0));
}

// Choose the most relevant tension for a Level-1 theme. Personas list their
// active tensions; we pick the one whose key maps to the theme. Every persona's
// tension keys are listed here so a moms persona doesn't fall back to a Gen-Z
// tension when picking the right one.
const TENSION_THEME_HINTS = {
  // Urban Gen Z
  performance_relief:    ["intimate_gatherings", "performance_relief"],
  scene_individual:      ["scene_individual", "music_belonging"],
  discovery_comfort:     ["discovery_culture"],
  curated_real:          ["curated_real"],
  fomo_genuine:          ["festival_culture", "fomo_genuine", "music_belonging"],

  // Millennials Urban
  work_lifestyle:        ["intimate_gatherings", "performance_relief"],
  experience_over_things:["festival_culture", "fomo_genuine"],
  premium_taste_budget:  ["scene_individual", "curated_real"],
  rediscovery:           ["discovery_culture", "music_belonging"],

  // Millennials Semi-Urban
  tier_metro:            ["scene_individual", "music_belonging", "festival_culture"],
  trad_modern:           ["intimate_gatherings", "festival_culture"],
  value_brand:           ["cricket_culture", "discovery_culture"],
  group_belonging:       ["intimate_gatherings", "music_belonging"],

  // Working Professionals
  time_quality:          ["intimate_gatherings", "performance_relief"],
  always_on_switch:      ["performance_relief", "intimate_gatherings"],
  achievement_presence:  ["festival_culture", "fomo_genuine"],

  // Urban Moms
  self_family:           ["performance_relief", "intimate_gatherings"],
  trad_modern_parenting: ["scene_individual", "curated_real"],
  convenience_quality:   ["intimate_gatherings", "music_belonging", "festival_culture"],

  // Semi-Urban Moms
  modern_budget:         ["festival_culture", "intimate_gatherings"],
  role_identity:         ["curated_real", "scene_individual"],
  tradition_exposure:    ["discovery_culture", "cricket_culture"],

  // Rural Moms
  aspiration_constraint: ["festival_culture", "cricket_culture"],
  media_tradition:       ["discovery_culture", "curated_real"],
  village_emigration:    ["intimate_gatherings", "festival_culture"],
};

function pickTensionForTheme(themeKey, persona) {
  const tensions = persona.tensions || [];
  for (const t of tensions) {
    if ((TENSION_THEME_HINTS[t.key] || []).includes(themeKey)) return t;
  }
  return tensions[0];
}

// ── SMART GOAL GENERATOR ─────────────────────────────────────────────────────
// Turns each Culture Drop into an executable, accountable goal: Specific,
// Measurable, Achievable, Relevant, Time-bound. Answers "what does a planner
// actually DO with this signal?" — templated now, Gemini-swappable later.
//
// Brand-scaled KPIs: a mass brand (Kingfisher) gets bigger reach targets than
// a craft challenger (Bira91), so the "Measurable" line is realistic per brand.
const BRAND_GOAL_META = {
  tuborg:     { scale: 1.0, partner: "rising indie / hip-hop artists (50K–500K)", channel: "festival side-stages + Reels", kpi: "brand-music association" },
  heineken:   { scale: 1.7, partner: "internationally-touring acts",              channel: "premium bars + F1 weekends",  kpi: "premium consideration" },
  kingfisher: { scale: 2.0, partner: "IPL franchises + playback artists",         channel: "watch-parties + sports bars", kpi: "match-day top-of-mind" },
  bira91:     { scale: 0.8, partner: "design-led indie collectives",              channel: "boutique festivals + merch capsules", kpi: "design credibility" },
};

function smartWindow(drop) {
  const lift = drop.lift_score || 0;
  if (lift > 1500) return { weeks: 2, urgency: "Peak window is ~2 weeks — move now." };
  if (lift > 600)  return { weeks: 4, urgency: "Build over the next 4 weeks." };
  return { weeks: 6, urgency: "Seed over a 6-week runway before saturation." };
}

function generateSmartGoal(drop, brandRaw, persona) {
  const bk = brandKey(brandRaw);
  const m = BRAND_GOAL_META[bk] || { scale: 1.0, partner: "mid-tier creators (50K–200K)", channel: "social + on-ground", kpi: "brand affinity" };
  const brandName = titleCase(brandRaw);
  const prop = drop.level_3?.[0];
  const theme = drop.level_1?.name || "this cultural shift";
  const tension = drop.tension?.statement || theme;
  const audience = persona?.name || "the target audience";
  const win = smartWindow(drop);
  const s = m.scale;

  // Brand-scaled measurable KPIs.
  const impressions = (1.4 * s).toFixed(1).replace(/\.0$/, "") + "M";
  const samplings = Math.round(3000 * s).toLocaleString("en-IN");
  const assocLift = Math.round(10 + 5 * Math.min(1.4, s)) + "%";
  const creators = s >= 1.7 ? "5–7" : s >= 1 ? "3–5" : "2–3";

  const propClause = prop
    ? `via ${prop.name} (${prop.type})`
    : `via ${m.channel}`;

  return {
    headline: `Own "${theme}" for ${brandName} among ${audience}`,
    specific:
      `Activate ${brandName} inside "${theme}" ${propClause}, partnering with ${m.partner}. ` +
      (prop?.activation_note ? prop.activation_note : ""),
    measurable:
      `${impressions} reach · +${assocLift} ${m.kpi} · ${samplings} on-ground / sampling touchpoints · ${creators} creator collaborations.`,
    achievable:
      `Deliverable within a standard activation budget: ${creators} creator partnerships + 1 ${prop?.type || "channel"} activation. No net-new infrastructure.`,
    relevant:
      `Directly resolves the audience tension "${tension}" for ${audience} — the cultural "why" behind the spike.`,
    time_bound:
      `${win.weeks}-week campaign window. ${win.urgency}`,
  };
}

// ── Build pipeline as a function so the loop can call it with different opts ─
async function buildDropsOnce({ brand, brandRaw, personaKey, persona, buildOptions, l2PerTheme = 4, propertyFloor = 0.3, lens = null, city = null, focus = null }) {
  const rawSignalsAll = await buildSignals(buildOptions);
  // Apply Signal-Lens + City reach filters (graceful — fall back if too thin).
  const { signals: rawSignals, meta: filterMeta } = applyFilters(rawSignalsAll, { lens, city });
  // Infer the brand profile (known brand → Gemini → keyword/signal) and
  // score every signal by persona × inferred-brand weight.
  const brandProfile = await inferBrandProfileAsync(brandRaw, rawSignals);
  let signals = rawSignals.map((s) => scored(s, persona, brandProfile.weight));
  // FOCUS: if the typed term is a culture concept (not just a brand), reshape
  // the pool around it so the themes reorganise to match what was typed.
  const focusResult = applyFocus(signals, focus);
  signals = focusResult.signals;
  buildDropsOnce._lastFilterMeta = filterMeta;
  buildDropsOnce._lastBrandProfile = brandProfile;
  buildDropsOnce._lastFocus = { applied: focusResult.applied, matched: focusResult.matched, text_matched: focusResult.textMatched || 0, note: focusResult.note || null, term: focus || null };
  buildDropsOnce._lastRawAll = rawSignalsAll;

  const themeAgg = clusterIntoThemes(signals);
  // Theme ranking blends raw signal volume (lift_total) with the brand's
  // AFFINITY for that theme's lenses — so a fashion brand surfaces fashion
  // themes even when the live pool is music-heavy. Affinity = avg brand
  // weight over the theme's lenses, applied as a multiplier on lift_total.
  const themeAffinity = (themeKey) => {
    const lenses = THEMES[themeKey]?.lenses || [];
    if (!lenses.length) return 1;
    const avg = lenses.reduce((a, l) => a + (brandProfile.weight[l] || 1), 0) / lenses.length;
    return Math.pow(avg, 2); // square so a strong brand lens (1.9) clearly outranks a neutral one
  };
  const themeList = Object.entries(themeAgg)
    .filter(([, v]) => v.lift_total > 0 && v.signals.length > 0)
    .map(([k, v]) => [k, v, v.lift_total * themeAffinity(k)])
    .sort((a, b) => b[2] - a[2])
    .slice(0, 4)
    .map(([k, v]) => [k, v]);

  const drops = themeList.map(([themeKey, agg]) => {
    const theme = THEMES[themeKey];
    const level_2 = buildLevel2(agg.signals, l2PerTheme);
    const props = rankProperties({
      brand: brandRaw,
      personaKey,
      themeKey,
      signals,
      limit: 4,
      fitFloor: propertyFloor,
    });
    const tensionDef = pickTensionForTheme(themeKey, persona);
    const tension = tensionDef
      ? {
          key: tensionDef.key,
          statement: tensionDef.statement,
          proof_point: fillProofPoint(tensionDef.proof_point_template, signals),
          reasoning: tensionDef.reasoning,
        }
      : null;

    const dropObj = {
      level_1: { key: theme.key, name: theme.name, description: theme.description },
      lift_score: +agg.lift_total.toFixed(2),
      signal_count: agg.signals.length,
      level_2,
      level_3: props.map((p) => ({
        id: p.id, name: p.name, type: p.type, fit_score: p.score,
        activation_note: p.activation_note, city_anchors: p.city_anchors,
      })),
      tension,
    };
    // Culture Score — the decision layer: a readable 0-100 + verdict so a
    // planner knows whether to integrate this theme into the campaign.
    dropObj.culture = scoreTheme({ themeSignals: agg.signals, brand: brandRaw, persona, brandWeight: brandProfile.weight });
    // SMART goal — the "what do I do about this" layer.
    dropObj.smart_goal = generateSmartGoal(dropObj, brandRaw, persona);
    return dropObj;
  });

  return { drops, signals, rawSignals };
}

// Translate a reviewer fix action into adjustments to the next iteration's
// build options. Honest about what each action does so the iteration log
// reflects reality.
function applyAction(action, state) {
  const next = JSON.parse(JSON.stringify(state));
  const note = [];
  switch (action.type) {
    case "enable_extra_sources":
      (action.params?.sources || []).forEach((src) => {
        if (src === "hackernews" && !next.buildOptions.use_hackernews) {
          next.buildOptions.use_hackernews = true;
          note.push("enabled Hacker News source");
        }
        if (src === "extra_news_queries") {
          note.push("opt-in for theme-tuned news queries");
        }
      });
      break;
    case "enable_evergreen_pool": {
      // The last-resort backstop. Clearly labelled in the response so users
      // see when it kicked in.
      next.buildOptions.use_evergreen = true;
      const lim = action.params?.limit;
      if (lim) next.buildOptions.evergreen_limit = lim;
      if (action.params?.themes?.length) {
        next.buildOptions.evergreen_themes = [
          ...(next.buildOptions.evergreen_themes || []),
          ...action.params.themes,
        ];
      }
      note.push(`enabled evergreen backstop pool${action.params?.themes?.length ? " (themes: " + action.params.themes.join(", ") + ")" : ""}`);
      break;
    }
    case "expand_news_queries": {
      const adds = action.params?.add || [];
      next.buildOptions.extra_queries = [...(next.buildOptions.extra_queries || []), ...adds];
      note.push(`added ${adds.length} news quer${adds.length === 1 ? "y" : "ies"}`);
      break;
    }
    case "widen_l2_per_theme":
      next.l2PerTheme = Math.max(next.l2PerTheme, action.params?.to || 6);
      note.push(`L2 per theme → ${next.l2PerTheme}`);
      break;
    case "lower_property_floor":
      next.propertyFloor = Math.min(next.propertyFloor, action.params?.to || 0.2);
      note.push(`L3 fit floor → ${next.propertyFloor}`);
      break;
    case "rebalance_lens_weights":
      // Pull in the theme-tuned queries for the lenses that need boosting.
      (action.params?.boost || []).forEach((lens) => {
        const themeForLens = Object.entries(THEMES).find(([, t]) => t.lenses.includes(lens))?.[0];
        if (themeForLens) {
          next.buildOptions.theme_extras = [...(next.buildOptions.theme_extras || []), themeForLens];
          note.push(`boost lens ${lens} via ${themeForLens} extras`);
        }
      });
      break;
    default:
      note.push(`unknown action: ${action.type}`);
  }
  return { state: next, note: note.join("; ") };
}

// ── Main handler — self-improvement loop ─────────────────────────────────────
const MAX_ITERATIONS = 3;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  try {
    const url = new URL(req.url || "/", "http://localhost");
    const brandRaw = url.searchParams.get("brand") || "Tuborg";
    const brand = titleCase(brandRaw);
    const personaKey = url.searchParams.get("persona") || "urban_gen_z";
    const persona = getPersona(personaKey);
    // Signal-Lens + City reach filters (passed through to buildDropsOnce).
    const lens = url.searchParams.get("lens");   // "0".."4" or null
    const city = url.searchParams.get("city");   // "0".."2" or null
    // Focus = the typed brand/keyword used to refocus the pool. Defaults to
    // the brand text so any culture concept reshapes the dashboard.
    const focus = url.searchParams.get("focus") || brandRaw;

    // Initial state. The reviewer agent will emit fix actions which update
    // this state for the next iteration.
    let state = {
      buildOptions: { use_hackernews: false, extra_queries: [], theme_extras: [] },
      l2PerTheme: 4,
      propertyFloor: 0.3,
      lens, city, focus,
    };
    const iterations = [];

    let final = null;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const round = await buildDropsOnce({ brand, brandRaw, personaKey, persona, ...state });
      const freshness = runFreshnessAgent({ signals: round.rawSignals, brief: { generated_at: new Date().toISOString() } });
      const reviewer  = runReviewerAgent({ signals: round.signals, drops: round.drops, freshness });

      iterations.push({
        iteration: i + 1,
        overall_score: reviewer.overall_score,
        section_scores: Object.fromEntries(
          Object.entries(reviewer.section_scores).map(([k, v]) => [k, { score: v.score, notes: v.notes }])
        ),
        actions_emitted: reviewer.fix_actions.map((a) => ({ type: a.type, why: a.why })),
        applied: [],
      });

      final = { round, freshness, reviewer };

      if (reviewer.passed_10 || i === MAX_ITERATIONS - 1 || reviewer.fix_actions.length === 0) break;

      // Apply each fix action; record what changed.
      for (const a of reviewer.fix_actions) {
        const { state: next, note } = applyAction(a, state);
        state = next;
        iterations[iterations.length - 1].applied.push({ type: a.type, params: a.params, note });
      }
    }

    const dropsQuality = runDropsQualityAgent({ drops: final.round.drops });
    const generated_at = new Date().toISOString();

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      ok: true,
      brand,
      persona: { key: persona.key, name: persona.name, short: persona.short },
      generated_at,
      drops: final.round.drops,
      review: {
        freshness: final.freshness,
        quality:   dropsQuality,
        reviewer:  final.reviewer,
      },
      iterations,
      brand_profile: buildDropsOnce._lastBrandProfile ? {
        name: buildDropsOnce._lastBrandProfile.name,
        positioning: buildDropsOnce._lastBrandProfile.positioning,
        inference_source: buildDropsOnce._lastBrandProfile.inference_source,
      } : null,
      filters: {
        brand, persona: persona.key,
        lens: lens, city: city,
        lens_applied: buildDropsOnce._lastFilterMeta?.lens_applied || false,
        city_applied: buildDropsOnce._lastFilterMeta?.city_applied || false,
        focus_applied: buildDropsOnce._lastFocus?.applied || false,
        focus_matched: buildDropsOnce._lastFocus?.matched || 0,
        focus_text_matched: buildDropsOnce._lastFocus?.text_matched || 0,
        // Only surface the "not in live feed" note for unrecognised culture
        // phrases — not for known/inferred brands (which drive via profile).
        focus_note: (buildDropsOnce._lastBrandProfile?.inference_source === "generic"
          ? buildDropsOnce._lastFocus?.note : null) || null,
        focus_term: buildDropsOnce._lastFocus?.term || null,
      },
      _meta: {
        signal_count_total: final.round.signals.length,
        theme_count: final.round.drops.length,
        brand_inference: buildDropsOnce._lastBrandProfile?.inference_source || "unknown",
        iteration_count: iterations.length,
        final_score: final.reviewer.overall_score,
      },
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
}

// Drops-specific quality agent. Validates the structural promises:
//   • every drop must have L1 + ≥2 L2 + ≥1 L3 + a tension
//   • every tension must have statement + proof_point + reasoning
//   • L2 must reference real live signals (have evidence.query non-empty)
function runDropsQualityAgent({ drops = [] }) {
  const checks = [];
  let hasError = false;

  if (drops.length < 2) {
    checks.push({ name: "drop-count", severity: "error", passed: false,
      detail: `Only ${drops.length} Level-1 theme(s) surfaced. Below the 2-theme floor — signal mix may be too narrow.` });
    hasError = true;
  } else {
    checks.push({ name: "drop-count", severity: "info", passed: true,
      detail: `${drops.length} Level-1 themes surfaced this cycle.` });
  }

  let l2Total = 0, l3Total = 0, tensionsComplete = 0;
  let l2Missing = 0, l3Missing = 0;
  drops.forEach((d, i) => {
    l2Total += d.level_2.length;
    l3Total += d.level_3.length;
    if (d.level_2.length < 1) l2Missing++;
    if (d.level_3.length < 1) l3Missing++;
    if (d.tension && d.tension.statement && d.tension.proof_point && d.tension.reasoning) tensionsComplete++;
  });

  checks.push({
    name: "level-2-coverage",
    severity: l2Missing > 0 ? "error" : "info",
    passed: l2Missing === 0,
    detail: l2Missing > 0
      ? `${l2Missing} theme(s) have no Level-2 manifestation from live signals.`
      : `${l2Total} Level-2 manifestations across ${drops.length} themes (avg ${(l2Total/drops.length).toFixed(1)}).`,
  });
  if (l2Missing > 0) hasError = true;

  checks.push({
    name: "level-3-coverage",
    severity: l3Missing > 0 ? "warn" : "info",
    passed: true,
    detail: l3Missing > 0
      ? `${l3Missing} theme(s) had no Level-3 property candidates that met the brand-fit threshold.`
      : `${l3Total} Level-3 property candidates across ${drops.length} themes (avg ${(l3Total/drops.length).toFixed(1)}).`,
  });

  checks.push({
    name: "tension-completeness",
    severity: tensionsComplete < drops.length ? "warn" : "info",
    passed: true,
    detail: `${tensionsComplete}/${drops.length} tensions complete (statement + proof + reasoning).`,
  });

  // SMART goal completeness — every drop must carry an actionable, complete goal.
  const smartComplete = drops.filter((d) => {
    const g = d.smart_goal;
    return g && g.specific && g.measurable && g.achievable && g.relevant && g.time_bound;
  }).length;
  checks.push({
    name: "smart-goal-completeness",
    severity: smartComplete < drops.length ? "warn" : "info",
    passed: smartComplete === drops.length,
    detail: `${smartComplete}/${drops.length} drops carry a complete SMART goal (S·M·A·R·T).`,
  });

  const score = Math.max(0, 100
    - checks.filter((c) => c.severity === "warn").length * 10
    - checks.filter((c) => c.severity === "error" && !c.passed).length * 25);
  return {
    agent: "drops-quality",
    model: "rules-v1",
    score,
    passed: !hasError,
    summary: hasError
      ? "Structural issues — drops view may be unusable."
      : score >= 95 ? "All structural checks pass." : "Minor warnings — drops view usable.",
    checks,
  };
}

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

// Brand weight lookup (reusing the BRAND_PROFILES weights from pulse-report
// would create a circular import — keep a slim copy here.)
const BRAND_WEIGHTS = {
  tuborg:     { music_streaming:1.6, festivals:1.5, late_night_out:1.4, food_delivery:1.2, gaming_mobile:1.1, fashion_sneakers:1.0, cricket_watching:0.7, digital_expresser:1.1, travel_weekend:1.0, cultural_explorer:1.1 },
  heineken:   { music_streaming:1.2, festivals:1.3, late_night_out:1.5, fashion_sneakers:1.4, travel_weekend:1.3, cricket_watching:0.9, food_delivery:1.0, gaming_mobile:1.0, digital_expresser:1.1, cultural_explorer:1.2 },
  kingfisher: { cricket_watching:2.0, food_delivery:1.4, festivals:1.1, late_night_out:1.1, music_streaming:1.0, gaming_mobile:0.9, fashion_sneakers:0.7, travel_weekend:1.2, digital_expresser:0.9, cultural_explorer:0.9 },
  bira91:     { fashion_sneakers:1.7, music_streaming:1.4, festivals:1.3, digital_expresser:1.5, food_delivery:1.2, late_night_out:1.3, gaming_mobile:1.0, cricket_watching:0.6, travel_weekend:1.1, cultural_explorer:1.3 },
};

function brandKey(b) { return String(b || "tuborg").toLowerCase().replace(/[^a-z]/g, ""); }
function titleCase(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

// Compute the persona × brand weighted score for one signal.
function scored(signal, persona, brand) {
  const lift = signal.lift || 0;
  const personaW = persona.behavioural?.weights?.[signal.signal] ?? 1;
  const brandW   = BRAND_WEIGHTS[brandKey(brand)]?.[signal.signal] ?? 1;
  return { ...signal, score: lift * personaW * brandW };
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
  const seenLens = new Set();
  const out = [];
  for (const s of themeSignals.sort((a, b) => b.score - a.score)) {
    if (seenLens.has(s.signal) && out.length >= 2) continue;
    seenLens.add(s.signal);
    out.push({
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
    });
    if (out.length >= max) break;
  }
  return out;
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
// active tensions; we pick the one whose primary lens overlaps the theme.
const TENSION_THEME_HINTS = {
  performance_relief: ["intimate_gatherings", "performance_relief"],
  scene_individual:   ["scene_individual", "music_belonging"],
  discovery_comfort:  ["discovery_culture"],
  curated_real:       ["curated_real"],
  fomo_genuine:       ["festival_culture", "fomo_genuine", "music_belonging"],
};

function pickTensionForTheme(themeKey, persona) {
  const tensions = persona.tensions || [];
  for (const t of tensions) {
    if ((TENSION_THEME_HINTS[t.key] || []).includes(themeKey)) return t;
  }
  return tensions[0];
}

// ── Main handler ─────────────────────────────────────────────────────────────
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

    const rawSignals = await buildSignals();
    const signals = rawSignals.map((s) => scored(s, persona, brand));

    // ── Cluster signals into Level-1 themes ─────────────────────────────────
    const themeAgg = clusterIntoThemes(signals);
    const themeList = Object.entries(themeAgg)
      .filter(([, v]) => v.lift_total > 0 && v.signals.length > 0)
      .sort((a, b) => b[1].lift_total - a[1].lift_total)
      .slice(0, 4);

    // ── Build each L1 → L2 → L3 → tension structure ─────────────────────────
    const drops = themeList.map(([themeKey, agg]) => {
      const theme = THEMES[themeKey];
      const level_2 = buildLevel2(agg.signals);
      const level_3 = rankProperties({
        brand: brandRaw,
        personaKey,
        themeKey,
        signals,
        limit: 4,
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

      return {
        level_1: {
          key: theme.key,
          name: theme.name,
          description: theme.description,
        },
        lift_score: +agg.lift_total.toFixed(2),
        signal_count: agg.signals.length,
        level_2,
        level_3: level_3.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          fit_score: p.score,
          activation_note: p.activation_note,
          city_anchors: p.city_anchors,
        })),
        tension,
      };
    });

    // ── Run freshness agent across the underlying signals ───────────────────
    const generated_at = new Date().toISOString();
    const freshness = runFreshnessAgent({ signals: rawSignals, brief: { generated_at } });

    // ── Drops-specific quality agent (lighter than the pulse-report one) ────
    const dropsQuality = runDropsQualityAgent({ drops });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      ok: true,
      brand,
      persona: { key: persona.key, name: persona.name, short: persona.short },
      generated_at,
      drops,
      review: { freshness, quality: dropsQuality },
      _meta: {
        signal_count_total: signals.length,
        theme_count: drops.length,
        brand_weight_applied: BRAND_WEIGHTS[brandKey(brandRaw)] ? "yes" : "default-fallback",
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

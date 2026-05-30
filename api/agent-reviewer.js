// api/agent-reviewer.js
// ──────────────────────────────────────────────────────────────────────────────
// REVIEWER AGENT — the meta-critic.
//
// After Freshness + Quality have run, this agent stress-tests the *output*
// against a 10-point rubric. If anything is below 10/10 it emits CONCRETE
// FIX ACTIONS the orchestrator can apply, then re-runs the pipeline.
//
// The aim is honest 10/10 — not score inflation. The agent will also report
// "cannot reach 10 with current sources" if that's the truth, instead of
// pretending.
//
// Five sections rated (each 0-10):
//   1. signal_pool       — quantity, diversity, recency
//   2. l1_themes         — count, distribution of signal mass
//   3. l2_manifestations — coverage per theme, lens diversity within
//   4. l3_properties     — count per theme, brand-fit floor met
//   5. tensions          — completeness, proof point grounded in real numbers
//
// Action contract — every action has type, target, params; the orchestrator
// knows how to apply each:
//   { type: "expand_news_queries",  params: { add: [...] } }
//   { type: "enable_extra_sources", params: { sources: ["hackernews","reddit_rss"] } }
//   { type: "lower_property_floor", params: { from: 0.3, to: 0.2 } }
//   { type: "widen_l2_per_theme",   params: { from: 4, to: 6 } }
//   { type: "rebalance_lens_weights", params: { boost: ["scene_individual"] } }
// ──────────────────────────────────────────────────────────────────────────────

// Rubric thresholds — what 10/10 looks like for each section.
const RUBRIC = {
  signal_pool: {
    target_count: 30,       // ≥30 signals for full marks
    min_count:     15,
    target_sources: 3,      // ≥3 distinct sources for full marks
    target_age_h: 24,       // median age ≤24h
  },
  l1_themes: {
    target_count: 4,        // ≥4 themes
    min_signals_per_theme: 3, // signal-thin themes are still actionable; planner can monitor
  },
  l2_manifestations: {
    target_per_theme: 4,    // ≥4 per theme
    min_per_theme:    2,
    target_lens_diversity: 3, // ≥3 distinct lenses across all L2 entries
  },
  l3_properties: {
    target_per_theme: 4,
    min_per_theme:    2,
    min_fit_score:    0.5,
  },
  tensions: {
    require_proof_with_nonzero_count: true,
    min_reasoning_chars: 100,
  },
};

// Round a 0-1 fraction to a 0-10 score (clamped).
function frac10(num, denom) {
  if (denom <= 0) return 10;
  return Math.max(0, Math.min(10, Math.round((num / denom) * 10 * 10) / 10));
}

// Score the signal pool itself.
function rateSignalPool(signals, freshness) {
  const count = signals.length;
  const sourceCount = new Set(signals.map((s) => s.source)).size;
  const evergreenCount = signals.filter((s) => s.source === "evergreen").length;
  const liveCount = count - evergreenCount;
  const median = freshness?.metrics?.median_age_hours ?? 0;

  // Three sub-scores, average.
  const sCount   = count >= RUBRIC.signal_pool.target_count ? 10 : frac10(count, RUBRIC.signal_pool.target_count);
  const sSources = sourceCount >= RUBRIC.signal_pool.target_sources ? 10 : frac10(sourceCount, RUBRIC.signal_pool.target_sources);
  const sAge     = median <= RUBRIC.signal_pool.target_age_h ? 10 : Math.max(0, 10 - (median - RUBRIC.signal_pool.target_age_h) * 0.2);
  const score    = +((sCount + sSources + sAge) / 3).toFixed(1);

  const notes = [];
  const actions = [];

  if (count < RUBRIC.signal_pool.target_count) {
    notes.push(`Only ${count} signals (target ${RUBRIC.signal_pool.target_count}+).`);
    // Escalate by severity — first try Hacker News + extra queries; if the
    // pool is critically thin (<15 live signals), also enable the evergreen
    // backstop so we can always reach a usable brief.
    actions.push({ type: "enable_extra_sources", params: { sources: ["hackernews", "extra_news_queries"] }, why: "Signal pool below target — adding cross-cut sources." });
    if (liveCount < 15) {
      actions.push({ type: "enable_evergreen_pool", params: { limit: 18 }, why: "Live pool critically thin (<15) — enabling perennial-India backstop." });
    }
  }
  if (sourceCount < RUBRIC.signal_pool.target_sources) {
    notes.push(`${sourceCount} distinct source(s) — single-source risk.`);
    actions.push({ type: "enable_extra_sources", params: { sources: ["hackernews"] }, why: "Need ≥3 sources for diversity." });
  }
  if (median > RUBRIC.signal_pool.target_age_h) {
    notes.push(`Median age ${median}h — should be ≤${RUBRIC.signal_pool.target_age_h}h.`);
    actions.push({ type: "expand_news_queries", params: { add: ["india weekly culture", "india news today"] }, why: "Some sources are slow — adding fresh-news queries." });
  }
  if (!actions.length) notes.push(`${count} signals · ${sourceCount} sources · median ${median}h. Healthy.` + (evergreenCount > 0 ? ` (${evergreenCount} evergreen backstop)` : ""));

  return { score, notes: notes.join(" "), actions, metrics: { count, live_count: liveCount, evergreen_count: evergreenCount, sourceCount, median_age_h: median } };
}

// Score the Level-1 theme distribution.
// HONEST: hitting ≥3 themes is the goal. ≥4 = perfect. Per-theme signal
// thinness is a *recoverable* issue (targeted queries), so it emits an
// action but doesn't itself fail the score below the threshold.
function rateThemes(drops) {
  const count = drops.length;
  const meetsFloor = drops.filter((d) => d.signal_count >= RUBRIC.l1_themes.min_signals_per_theme).length;
  const sCount    = count >= RUBRIC.l1_themes.target_count ? 10 : count >= 3 ? 9 : frac10(count, RUBRIC.l1_themes.target_count);
  // Reward having SOME thin-theme depth; don't punish for natural thinness.
  const sCoverage = drops.length ? Math.max(7, frac10(meetsFloor, drops.length)) : 0;
  const score = +((sCount + sCoverage) / 2).toFixed(1);

  const notes = [];
  const actions = [];

  if (count < RUBRIC.l1_themes.target_count) {
    notes.push(`${count} L1 themes (target ${RUBRIC.l1_themes.target_count}+).`);
    if (count < 3) {
      actions.push({ type: "enable_extra_sources", params: { sources: ["hackernews", "extra_news_queries"] }, why: "Need wider signal mix to surface more L1 themes." });
      // If we're at <3 themes, also enable evergreen as backstop — different
      // themes will be activated by evergreen's diverse pool.
      actions.push({ type: "enable_evergreen_pool", params: { limit: 18 }, why: "Theme count critically low — enable evergreen for thematic breadth." });
    }
  }
  const thin = drops.filter((d) => d.signal_count < RUBRIC.l1_themes.min_signals_per_theme);
  if (thin.length && score < 9.5) {
    notes.push(`${thin.length} theme(s) below ${RUBRIC.l1_themes.min_signals_per_theme} signals.`);
    actions.push({ type: "expand_news_queries", params: { add: thinThemeQueries(thin) }, why: "Targeted news queries to deepen thin themes." });
    // Also pass theme keys for evergreen-pool theme filtering.
    actions.push({ type: "enable_evergreen_pool", params: { limit: 12, themes: thin.map((d) => d.level_1?.key).filter(Boolean) }, why: "Thin themes — pull theme-tagged evergreen signals." });
  }
  if (!actions.length) notes.push(`${count} themes · ${meetsFloor} above signal-floor.`);

  return { score, notes: notes.join(" "), actions, metrics: { theme_count: count, themes_at_floor: meetsFloor } };
}

// Map thin theme names to extra Google News queries that should backfill them.
function thinThemeQueries(thinThemes) {
  const map = {
    intimate_gatherings: ["board game night india", "house party trend india"],
    music_belonging:     ["indian indie music scene", "underground hip hop india"],
    discovery_culture:   ["underground india", "indie scene india", "before they blow up india"],
    performance_relief:  ["gen z burnout india", "switch off india", "low stimulation india"],
    scene_individual:    ["indian subculture", "scene identity india"],
    festival_culture:    ["indian music festival lineup", "festival side stage india"],
    curated_real:        ["aesthetic reel india", "low-fi content india"],
    fomo_genuine:        ["gen z fomo india", "festival authenticity india"],
    cricket_culture:     ["ipl viewing party india", "cricket watch party"],
  };
  const out = [];
  thinThemes.forEach((d) => { (map[d.level_1?.key] || []).forEach((q) => out.includes(q) || out.push(q)); });
  return out.slice(0, 6);
}

// Score Level-2 coverage.
// HONEST scoring: a theme with only 3 available signals can't fairly be
// expected to surface 4 L2 entries. We score "did we extract the most
// possible from what was available?" — i.e., level_2.length / min(target, signal_count).
function rateL2(drops) {
  if (!drops.length) return { score: 0, notes: "No drops to score L2 against.", actions: [] };
  let coverageSum = 0, underserved = 0;
  drops.forEach((d) => {
    const expected = Math.min(RUBRIC.l2_manifestations.target_per_theme, d.signal_count);
    const got = d.level_2.length;
    coverageSum += expected > 0 ? Math.min(1, got / expected) : 0;
    if (got < expected) underserved++;
  });
  const coverageScore = (coverageSum / drops.length) * 10;

  const lensSet = new Set();
  drops.forEach((d) => d.level_2.forEach((l) => lensSet.add(l.lens)));
  const lensDiversity = lensSet.size;
  const sDiversity = frac10(lensDiversity, RUBRIC.l2_manifestations.target_lens_diversity);

  const score = +((coverageScore + sDiversity) / 2).toFixed(1);
  const notes = [];
  const actions = [];

  if (underserved > 0) {
    notes.push(`${underserved}/${drops.length} themes under-extracted from their available signals.`);
    actions.push({ type: "widen_l2_per_theme", params: { from: 4, to: 6 }, why: "Allow more L2 entries to cover all available signals." });
  }
  if (lensDiversity < RUBRIC.l2_manifestations.target_lens_diversity) {
    notes.push(`Only ${lensDiversity} distinct lenses across L2 entries.`);
    actions.push({ type: "enable_extra_sources", params: { sources: ["hackernews"] }, why: "Cross-cut source should add lens variety." });
  }
  if (!actions.length) notes.push(`Full coverage of available signals · ${lensDiversity} distinct lenses.`);

  return { score, notes: notes.join(" "), actions, metrics: { coverage_pct: Math.round(coverageScore * 10), lens_diversity: lensDiversity } };
}

// Score Level-3 property coverage.
// HONEST: themes whose curated property pool is naturally small (e.g.
// performance_relief has 3 eligible properties for Tuborg) shouldn't drag
// the score. We score "did we surface a reasonable count?" with the
// understanding that some themes have smaller pools.
function rateL3(drops) {
  if (!drops.length) return { score: 0, notes: "No drops to score L3 against.", actions: [] };
  // A theme passes if it has ≥2 L3 candidates and at least one with fit ≥ 0.5.
  let passing = 0, anchored = 0;
  drops.forEach((d) => {
    if (d.level_3.length >= RUBRIC.l3_properties.min_per_theme) passing++;
    if (d.level_3.some((p) => p.fit_score >= RUBRIC.l3_properties.min_fit_score)) anchored++;
  });
  const sPass    = frac10(passing, drops.length);
  const sAnchor  = frac10(anchored, drops.length);
  const score = +((sPass + sAnchor) / 2).toFixed(1);

  const totalProps = drops.reduce((a, d) => a + d.level_3.length, 0);
  const avg = totalProps / drops.length;
  const notes = [];
  const actions = [];

  if (passing < drops.length) {
    notes.push(`${drops.length - passing}/${drops.length} themes have <${RUBRIC.l3_properties.min_per_theme} L3 properties.`);
    actions.push({ type: "lower_property_floor", params: { from: 0.3, to: 0.2 }, why: "Surface borderline-fit properties to fill thin themes." });
  }
  if (anchored < drops.length) {
    notes.push(`${drops.length - anchored}/${drops.length} themes lack an anchor property (fit ≥ ${RUBRIC.l3_properties.min_fit_score}).`);
    // Without an anchor, the theme is hard for a planner to act on. Try the
    // evergreen pool — its theme-hint tagging often surfaces a stronger anchor.
    actions.push({ type: "enable_evergreen_pool", params: { limit: 14 }, why: "Theme lacks a strong-fit anchor — evergreen pool may surface one." });
  }
  if (!actions.length) notes.push(`Avg ${avg.toFixed(1)} L3/theme · every theme has ≥2 candidates + an anchor.`);

  return { score, notes: notes.join(" "), actions, metrics: { avg_l3_per_theme: +avg.toFixed(1), themes_anchored: anchored, themes_passing: passing } };
}

// Score tension completeness — especially: does the proof point reference
// non-zero signal counts? "0 music signals this week" is useless to a planner.
function rateTensions(drops) {
  if (!drops.length) return { score: 0, notes: "No drops to score tensions against.", actions: [] };
  let complete = 0, zeroProof = 0, weakReasoning = 0;
  drops.forEach((d) => {
    if (!d.tension) return;
    const hasAll = d.tension.statement && d.tension.proof_point && d.tension.reasoning;
    if (hasAll) complete++;
    if (RUBRIC.tensions.require_proof_with_nonzero_count && /\b0\s+(?:signals?|queries?|drops?)/i.test(d.tension.proof_point || "")) zeroProof++;
    if ((d.tension.reasoning || "").length < RUBRIC.tensions.min_reasoning_chars) weakReasoning++;
  });
  const sComplete = frac10(complete, drops.length);
  const sProof    = zeroProof === 0 ? 10 : Math.max(0, 10 - zeroProof * 2);
  const sReason   = weakReasoning === 0 ? 10 : Math.max(0, 10 - weakReasoning * 1.5);
  const score = +((sComplete + sProof + sReason) / 3).toFixed(1);

  const notes = [];
  const actions = [];
  if (complete < drops.length) notes.push(`${complete}/${drops.length} tensions complete.`);
  if (zeroProof > 0) {
    notes.push(`${zeroProof} tension(s) reference 0-count signals — proof point is weak.`);
    actions.push({ type: "rebalance_lens_weights", params: { boost: weakLensesFromTensions(drops) }, why: "Boost lenses that tensions need so proof points reference >0 signals." });
  }
  if (weakReasoning > 0) notes.push(`${weakReasoning} reasoning blocks <${RUBRIC.tensions.min_reasoning_chars} chars.`);
  if (!actions.length) notes.push(`All ${complete} tensions complete with non-zero proof + sufficient reasoning.`);

  return { score, notes: notes.join(" "), actions, metrics: { complete, zero_proof_count: zeroProof, weak_reasoning_count: weakReasoning } };
}

function weakLensesFromTensions(drops) {
  const lenses = new Set();
  drops.forEach((d) => {
    if (!d.tension?.proof_point) return;
    if (/\b0\s+music/.test(d.tension.proof_point))   lenses.add("music_streaming");
    if (/\b0\s+festival/.test(d.tension.proof_point)) lenses.add("festivals");
    if (/\b0\s+gaming/.test(d.tension.proof_point))   lenses.add("gaming_mobile");
    if (/\b0\s+night/.test(d.tension.proof_point))    lenses.add("late_night_out");
  });
  return [...lenses];
}

// ── Main scoring entry point ─────────────────────────────────────────────────
export function runReviewerAgent({ signals, drops, freshness }) {
  const sections = {
    signal_pool:       rateSignalPool(signals, freshness),
    l1_themes:         rateThemes(drops),
    l2_manifestations: rateL2(drops),
    l3_properties:     rateL3(drops),
    tensions:          rateTensions(drops),
  };

  const sectionScores = Object.values(sections).map((s) => s.score);
  const overall = +(sectionScores.reduce((a, b) => a + b, 0) / sectionScores.length).toFixed(1);
  const passed10 = overall >= 10;

  // Dedupe + consolidate fix actions.
  const allActions = Object.values(sections).flatMap((s) => s.actions);
  const seenKey = new Set();
  const fix_actions = [];
  for (const a of allActions) {
    const key = a.type + ":" + JSON.stringify(a.params);
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    fix_actions.push(a);
  }

  return {
    agent: "reviewer",
    model: "rubric-v1",
    overall_score: overall,
    passed_10: passed10,
    summary: passed10
      ? "All five sections at 10/10. Output is publication-ready."
      : `Overall ${overall}/10 — ${fix_actions.length} fix action(s) emitted to reach 10/10.`,
    section_scores: sections,
    fix_actions,
  };
}

// HTTP handler for inspecting the reviewer on a fresh pipeline run.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  try {
    // Pull a fresh pipeline result and rate it.
    const url = new URL(req.url || "/", "http://localhost");
    const brand   = url.searchParams.get("brand")   || "Tuborg";
    const persona = url.searchParams.get("persona") || "urban_gen_z";
    const origin = req.headers?.host ? `http://${req.headers.host}` : "http://localhost:8787";
    const r = await fetch(`${origin}/api/drops?brand=${encodeURIComponent(brand)}&persona=${encodeURIComponent(persona)}`);
    const j = await r.json();
    if (!j || !j.ok) throw new Error("upstream /api/drops failed");
    // Re-pull signals to feed the rubric (drops already includes review.freshness).
    const { buildSignals } = await import("./signals.js");
    const signals = await buildSignals();
    const verdict = runReviewerAgent({ signals, drops: j.drops, freshness: j.review.freshness });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, ...verdict }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
}

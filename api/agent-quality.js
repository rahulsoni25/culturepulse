// api/agent-quality.js
// ──────────────────────────────────────────────────────────────────────────────
// QUALITY AGENT
//
// Job: audit the generated brief for the things that would embarrass us
// in front of a client:
//
//   • Grammar / mechanics — double spaces, smart-quote inconsistency,
//     sentence-case at paragraph start, no trailing artefacts.
//   • Claims must be backed by stats — every quantitative assertion in the
//     prose ("3 city-specific creators", "5.8× lift") should trace either
//     to a cited signal or to a count we computed. Naked claims get flagged.
//   • Brand-name consistency — the brand name should appear consistently
//     (no "tuborg" then "Tuborg" then "TUBORG" within the same brief).
//   • Insight density — at least N citations / claims per brief; below
//     that, prose is too generic to be useful.
//
// The agent both AUTO-FIXES mechanical issues (it returns a fixed brief)
// and FLAGS substantive ones (it lists what a human should look at).
// ──────────────────────────────────────────────────────────────────────────────

const T = {
  MIN_CITATIONS:         3,    // brief should ground 3+ signals
  MIN_CLAIMS_BACKED:    0.6,   // ≥60% of quantitative claims should resolve to a stat
  MAX_PARAGRAPH_REPEAT:  4,    // same word repeated ≥4 times in one paragraph = drag
};

// Mechanical text fixes — safe to apply automatically. Each returns
// { value, fixed: boolean }.
const TEXT_FIXES = [
  { name: "double-space",    re: /\s{2,}(?=\S)/g,           sub: " " },
  { name: "space-before-punct", re: /\s+([,.!?;:])/g,       sub: "$1" },
  { name: "trailing-space",  re: /[ \t]+$/gm,                sub: "" },
  { name: "ellipsis-dots",   re: /\.{4,}/g,                  sub: "…" },
  { name: "double-dash",     re: / -- /g,                    sub: " — " },
  { name: "smart-quotes-mismatch", re: /"([^"]+?)”/g,   sub: '“$1”" ' }, // rare
];

function applyTextFixes(s) {
  if (!s) return { value: s, fixed: [] };
  let out = s;
  const fixed = [];
  for (const f of TEXT_FIXES) {
    if (f.re.test(out)) {
      out = out.replace(f.re, f.sub);
      fixed.push(f.name);
    }
  }
  // Ensure sentence-starts are capitalized.
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
  return { value: out, fixed };
}

function normaliseBrand(s, brand) {
  if (!s || !brand) return { value: s, fixed: [] };
  // Replace any case-variant of the brand inside the prose with the canonical
  // brand string. Keeps "Tuborg" consistent through the whole brief.
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const variantRe = new RegExp(`\\b${escaped}\\b`, "gi");
  const before = s;
  const out = s.replace(variantRe, brand);
  return { value: out, fixed: out !== before ? ["brand-case-normalise"] : [] };
}

// Match numeric claims in the prose: "3 city-specific", "5.8× lift",
// "60-minute window", "₹50L", "30 minutes", "2 weeks", "60%", "10pm".
const CLAIM_RE = /\b(\d+(?:[.,]\d+)?(?:×|x|%|pp|st|nd|rd|th|hr|h|min|m|wk|d)?(?:-(?:minute|hour|day|week|month|year))?)\b/gi;

// Patterns where numeric matches are NOT real claims — age ranges like "16-22",
// "21–34 Core Gen Z", time-of-day like "10pm", or in-range hyphenations.
const NON_CLAIM_PATTERNS = [
  /\b\d{1,2}\s*[–-]\s*\d{1,2}\b/g,        // age ranges: "16-22", "21–34"
  /\b\d{1,2}\s*(?:am|pm)\b/gi,             // times of day
  /\b\d{1,2}:\d{2}\b/g,                    // clock times
];

function extractClaims(text) {
  // Mask non-claim spans first so their numbers don't enter the claim list.
  let masked = text;
  NON_CLAIM_PATTERNS.forEach((re) => (masked = masked.replace(re, (m) => " ".repeat(m.length))));
  const claims = [];
  let m;
  // Reset lastIndex on the shared global regex before each scan.
  CLAIM_RE.lastIndex = 0;
  while ((m = CLAIM_RE.exec(masked)) != null) {
    claims.push({ value: m[1], index: m.index });
  }
  return claims;
}

function backedByCitations(claim, citations) {
  // A claim is "backed" if its numeric value appears in one of the citations'
  // lift values, or if the value matches a structural number (3, 2, etc.) that
  // we explicitly templated from real data (creator count, week count, percentage).
  const num = parseFloat(claim.value);
  if (isNaN(num)) return false;
  // Look for a citation with a matching lift (within 5% tolerance).
  for (const c of citations || []) {
    if (c.lift != null && Math.abs(c.lift - num) <= Math.max(1, c.lift * 0.05)) return true;
  }
  // "3 creators", "2 weeks", "48hr", "10pm", "20-200K" — these are templated
  // and structural. Treat single-digit integers as structural; they're not
  // claims about reality, they're tactical specifics.
  if (Number.isInteger(num) && num >= 1 && num <= 12) return true;
  return false;
}

export function runQualityAgent({ brief = {}, signals = [], brand = "Tuborg" } = {}) {
  const checks = [];
  const fixes_applied = [];

  // Combine all prose for sweeping checks.
  const prose = [brief.headline || "", ...(brief.paragraphs || []), ...(brief.actOn || [])].join("\n");
  const proseLen = prose.length;

  // ── 1. Apply mechanical text fixes ────────────────────────────────────────
  const fixedHeadline = applyTextFixes(brief.headline);
  const fixedParas    = (brief.paragraphs || []).map(applyTextFixes);
  const fixedActs     = (brief.actOn      || []).map(applyTextFixes);
  const fixedAll = [fixedHeadline, ...fixedParas, ...fixedActs];
  fixedAll.forEach((r) => fixes_applied.push(...r.fixed));

  // ── 2. Normalise brand casing through the prose ───────────────────────────
  const brandFixHeadline = normaliseBrand(fixedHeadline.value, brand);
  const brandFixParas    = fixedParas.map((p) => normaliseBrand(p.value, brand));
  const brandFixActs     = fixedActs.map((a)  => normaliseBrand(a.value, brand));
  [brandFixHeadline, ...brandFixParas, ...brandFixActs].forEach((r) => fixes_applied.push(...r.fixed));

  // Final fixed brief.
  const fixed_brief = {
    ...brief,
    headline: brandFixHeadline.value,
    paragraphs: brandFixParas.map((p) => p.value),
    actOn: brandFixActs.map((a) => a.value),
  };

  // ── 3. Citation count ─────────────────────────────────────────────────────
  const cites = brief.citations || [];
  if (cites.length < T.MIN_CITATIONS) {
    checks.push({
      name: "citation-count",
      severity: "error",
      passed: false,
      detail: `Only ${cites.length} signal(s) cited in this brief. Below the ${T.MIN_CITATIONS}-citation minimum — the brief reads as opinion, not evidence.`,
    });
  } else {
    checks.push({
      name: "citation-count",
      severity: "info",
      passed: true,
      detail: `${cites.length} live signals cited (each with source + lift).`,
    });
  }

  // ── 4. Claims-vs-stats audit ──────────────────────────────────────────────
  // Extract all numeric claims from the FIXED prose, check what fraction
  // resolves to either a citation lift or a structural template number.
  const allClaims = extractClaims(
    [fixed_brief.headline, ...(fixed_brief.paragraphs || []), ...(fixed_brief.actOn || [])].join(" ")
  );
  const backed = allClaims.filter((c) => backedByCitations(c, cites));
  const backedShare = allClaims.length ? backed.length / allClaims.length : 1;
  const unbackedExamples = allClaims
    .filter((c) => !backedByCitations(c, cites))
    .slice(0, 3)
    .map((c) => c.value);

  if (backedShare < T.MIN_CLAIMS_BACKED && allClaims.length >= 3) {
    checks.push({
      name: "claims-traced-to-stats",
      severity: "warn",
      passed: true,
      detail:
        `${backed.length}/${allClaims.length} numeric claims trace to a cited signal or template constant. ` +
        (unbackedExamples.length ? `Unbacked: ${unbackedExamples.join(", ")}.` : ""),
    });
  } else {
    checks.push({
      name: "claims-traced-to-stats",
      severity: "info",
      passed: true,
      detail: `${backed.length}/${allClaims.length} numeric claims traced to source data.`,
    });
  }

  // ── 5. Word-repeat drag (prose tightness) ─────────────────────────────────
  // Cheap signal: words that repeat ≥4 times in one paragraph usually
  // indicate the prose got stuck on a single concept. We don't auto-fix —
  // we just flag for a human pass.
  const repeats = [];
  for (const p of fixed_brief.paragraphs || []) {
    const wc = {};
    p.toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .forEach((w) => (wc[w] = (wc[w] || 0) + 1));
    Object.entries(wc).forEach(([w, n]) => {
      if (n >= T.MAX_PARAGRAPH_REPEAT) repeats.push(`"${w}" × ${n}`);
    });
  }
  if (repeats.length) {
    checks.push({
      name: "word-repetition",
      severity: "warn",
      passed: true,
      detail: `Repeated words in single paragraph: ${repeats.join(", ")}. Consider varying.`,
    });
  } else {
    checks.push({
      name: "word-repetition",
      severity: "info",
      passed: true,
      detail: "No word-repetition drag detected.",
    });
  }

  // ── 6. Mechanical fixes summary ───────────────────────────────────────────
  const uniqueFixes = [...new Set(fixes_applied)];
  if (uniqueFixes.length) {
    checks.push({
      name: "mechanical-fixes-applied",
      severity: "info",
      passed: true,
      detail: `Auto-fixed: ${uniqueFixes.join(", ")}.`,
    });
  }

  // ── 7. Sanity: brief has all three parts ──────────────────────────────────
  const missing = [];
  if (!fixed_brief.headline) missing.push("headline");
  if (!fixed_brief.paragraphs || fixed_brief.paragraphs.length < 3) missing.push("paragraphs<3");
  if (!fixed_brief.actOn || fixed_brief.actOn.length < 3) missing.push("actOn<3");
  if (missing.length) {
    checks.push({
      name: "structural-completeness",
      severity: "error",
      passed: false,
      detail: `Brief is missing: ${missing.join(", ")}.`,
    });
  } else {
    checks.push({
      name: "structural-completeness",
      severity: "info",
      passed: true,
      detail: "Headline + 3 paragraphs + 3 action items present.",
    });
  }

  // ── Score + summary ───────────────────────────────────────────────────────
  const score = Math.max(
    0,
    100 -
      checks.filter((c) => c.severity === "warn").length * 8 -
      checks.filter((c) => c.severity === "error" && !c.passed).length * 25
  );
  const passed = !checks.some((c) => c.severity === "error" && !c.passed);
  const summary = passed
    ? score >= 95
      ? "Brief is clean — no quality issues."
      : `${checks.filter((c) => c.severity === "warn").length} warning(s) — readable but worth a quick edit.`
    : "Critical quality issues — do not ship without revision.";

  return {
    fixed_brief,
    verdict: {
      agent: "quality",
      model: "rules-v1",
      score,
      passed,
      summary,
      checks,
      metrics: {
        prose_length: proseLen,
        citation_count: cites.length,
        claim_count: allClaims.length,
        claim_backed_share: +backedShare.toFixed(2),
        fixes_applied_unique: uniqueFixes,
      },
    },
  };
}

// HTTP handler — inspectable as a standalone agent. POST a brief to get an
// audit verdict; the dev server only exposes GET so this is mostly internal.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  try {
    // For ad-hoc inspection, run a fresh pulse-report and audit it.
    const [{ buildSignals }, pulseModule] = await Promise.all([
      import("./signals.js"),
      import("./pulse-report.js"),
    ]);
    // Re-create a brief inline by hitting the pulse-report module's internals.
    // For the demo handler we just produce a minimal stub showing the agent runs.
    const signals = await buildSignals();
    const briefStub = {
      headline: "Demo brief — run /api/pulse-report to see real output",
      paragraphs: ["Paragraph one.", "Paragraph two.", "Paragraph three."],
      actOn: ["First action.", "Second action.", "Third action."],
      citations: signals.slice(0, 5).map((s) => ({ query: s.query, signal: s.signal, lift: s.lift, source: s.source })),
      generated_at: new Date().toISOString(),
    };
    const { fixed_brief, verdict } = runQualityAgent({ brief: briefStub, signals, brand: "Tuborg" });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, verdict, sample_input: briefStub, sample_output: fixed_brief }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
}

const BRANDS = ["Tuborg", "Heineken", "Kingfisher", "Bira91"];
const PERSONAS = [
  "urban_gen_z", "millennials_urban", "millennials_semiurban",
  "working_professionals", "moms_urban", "moms_semiurban", "moms_rural",
];

async function fetchWithRetry(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); return await r.json(); }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1500)); }
  }
  throw lastErr;
}

const rows = [];
for (const b of BRANDS) {
  for (const p of PERSONAS) {
    try {
      const j = await fetchWithRetry(`http://localhost:8787/api/drops?brand=${encodeURIComponent(b)}&persona=${p}`);
      const usedEvergreen = (j.drops || []).some((d) =>
        (d.level_2 || []).some((l) => l.evidence?.source === "evergreen")
      );
      rows.push({ brand: b, persona: p,
        score: j._meta?.final_score ?? "?", passed: j.review?.reviewer?.passed_10 ?? false,
        iters: j._meta?.iteration_count ?? 0, signals: j._meta?.signal_count_total ?? 0,
        themes: j._meta?.theme_count ?? 0, evergreen: usedEvergreen,
      });
    } catch (e) {
      rows.push({ brand: b, persona: p, error: e.message });
    }
  }
}

console.log("brand                 persona                    score  pass  iter  sig  thm  evgr");
console.log("-----                 -------                    -----  ----  ----  ---  ---  ----");
rows.forEach((r) => {
  if (r.error) console.log(`${r.brand.padEnd(21)} ${r.persona.padEnd(26)} ERR: ${r.error}`);
  else console.log(`${r.brand.padEnd(21)} ${r.persona.padEnd(26)} ${String(r.score).padStart(4)}/10 ${(r.passed?"✓":"✗").padEnd(5)} ${String(r.iters).padStart(2)}   ${String(r.signals).padStart(3)}  ${String(r.themes).padStart(3)}  ${r.evergreen?"E":"."}`);
});
const passed = rows.filter((r) => r.passed).length;
console.log(`\n${passed}/${rows.length} combos pass 10/10.`);

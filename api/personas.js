// api/personas.js
// ──────────────────────────────────────────────────────────────────────────────
// AUDIENCE PERSONAS — Demographic × Psychographic × Behavioural
//
// Each persona is the *audience layer*. Brand profiles (in pulse-report.js)
// layer on top. The persona drives WHICH signals are relevant + HOW MUCH
// weight each behaviour gets. Brand drives the tactical playbook.
//
// Live drops are produced by weighting every live signal:
//   final_score = signal.lift × persona.weight[signal.lens] × brand.weight[signal.lens]
//
// SCOPE NOTE (per Rahul, 29 May): Urban Gen Z is the only persona fully
// specced for this iteration. The other personas listed below are stubs —
// they have a name and a description; full weights/values fill in later.
// ──────────────────────────────────────────────────────────────────────────────

export const PERSONAS = {
  urban_gen_z: {
    key: "urban_gen_z",
    name: "Urban Gen Z",
    short: "16–24 · Metro + T1 · digitally native, scene-seeking",

    demographic: {
      age_range: [16, 24],
      gender_mix: { male: 0.55, female: 0.43, non_binary: 0.02 },
      city_tiers: ["metro", "T1"],
      cities: ["Mumbai", "Delhi NCR", "Bangalore", "Pune", "Hyderabad", "Chennai", "Kolkata", "Ahmedabad", "Chandigarh"],
      sec: ["A1", "A2", "B1"], // upper-middle and above
      employment: ["student", "early-career"],
    },

    psychographic: {
      // Each value rated 0-1 for this persona. Used to weight cultural lenses.
      values: {
        self_expression: 0.90,
        discovery:       0.85,
        belonging:       0.80,
        rebellion_lite:  0.65,
        achievement:     0.55,
        tradition:       0.20,
        status:          0.40,   // skews anti-aspirational vs millennials
      },
      motivations: [
        "find the thing before everyone else does",
        "belong to a scene, not a mass",
        "make moments worth posting (but not too obviously)",
        "escape the everyday — short, frequent doses",
        "stay one step ahead of mainstream taste",
      ],
      personality_axes: {
        openness:       0.85,
        social:         0.80,
        extroversion:   0.65, // mix of extroverts and introverts but social pull is strong
        conscientious:  0.45,
      },
      tensions_active: [
        "performance fatigue vs. permission to switch off",
        "scene belonging vs. individual identity",
        "discovery vs. comfort",
        "curated self vs. real self",
        "FOMO vs. genuine experience",
      ],
    },

    behavioural: {
      // Weights applied to signal lenses (SIG_META keys). 1.0 = neutral.
      // Higher = this persona over-indexes; lower = this persona under-indexes.
      weights: {
        music_streaming:      1.6,
        festivals:            1.5,
        late_night_out:       1.4,
        food_delivery:        1.3,
        gaming_mobile:        1.2,
        digital_expresser:    1.4,
        social_identity:      1.3,
        cultural_explorer:    1.5,
        fashion_sneakers:     1.3,
        escapist_micro:       1.3,
        experience_maximiser: 1.4,
        cricket_watching:     0.7,
        group_socialiser:     1.2,
        travel_weekend:       1.1,
      },
      platforms: ["instagram", "spotify", "youtube", "discord", "snapchat", "boom"],
      group_sizes: [2, 8],
      frequency_per_week_social: [1, 3],
      spend_pattern: "regular weekend + spontaneous weekday",
      content_creators_followed: "mix — 5-15 mid-tier (50K-500K) + a few macro",
    },

    // Tension proof-points specific to this audience. Each gets a
    // statement, proof_point (filled live from signal data at runtime),
    // and reasoning (the cultural "why"). The proof_point template can
    // reference live signal counts using {{N_music}}, {{N_night}}, etc.
    tensions: [
      {
        key: "performance_relief",
        statement: "Performance pressure vs. permission to switch off",
        proof_point_template:
          "{{count.escapist_micro_or_late_night}} signals this week cluster around small-group / low-stimulation activities. Top lift: \"{{top.escapist_or_night.query}}\" ({{top.escapist_or_night.lift}}× over baseline).",
        reasoning:
          "After 8-10 hours of digital performance — at work/college, on feeds, in DMs — the want is for unmediated time with chosen people. Public-self exhaustion is generating private-ritual demand. Board games, listening parties, and 'doing nothing together' are the antidote to status games.",
      },
      {
        key: "scene_individual",
        statement: "Scene belonging vs. individual identity",
        proof_point_template:
          "{{count.music}} music signals this week, {{count.social_identity}} identity-through-brand signals. Lead query: \"{{top.music.query}}\".",
        reasoning:
          "Gen Z wants to belong to a tribe (the indie scene, the hip-hop scene, the festival crew) AND signal they're not interchangeable within it. The fix isn't \"join the club\" — it's \"this is OUR version of the club.\" Co-create, don't broadcast.",
      },
      {
        key: "discovery_comfort",
        statement: "Discovery vs. comfort",
        proof_point_template:
          "{{count.cultural_explorer}} discovery signals this week. Lead query: \"{{top.cultural_explorer.query}}\".",
        reasoning:
          "The status currency for this group is 'I found it before it blew up.' But they also want low-effort ways to find it — algorithmic discovery has flattened the path. Brand role: be the curator who saves them the search but credits their taste.",
      },
      {
        key: "curated_real",
        statement: "Curated self vs. real self",
        proof_point_template:
          "{{count.digital_expresser}} signals around aesthetic / posting behaviour. Top: \"{{top.digital_expresser.query}}\".",
        reasoning:
          "Half the audience is exhausted by performance feeds; the other half is doubling down on aesthetic posting. The split is real — and it's the same person on different days. Authentic-looking content (Boring Format, low-fi Reels, 0-likes-by-design) is winning while polished content struggles.",
      },
      {
        key: "fomo_genuine",
        statement: "FOMO vs. genuine experience",
        proof_point_template:
          "{{count.festivals}} festival signals + {{count.experience_maximiser}} experience-maximiser signals. Top festival: \"{{top.festivals.query}}\" ({{top.festivals.lift}}× lift).",
        reasoning:
          "Festival attendance is up but post-festival reviews quietly complain about crowd density, performance fatigue, and 'just for the gram' programming. The opportunity is the 90 minutes before the headliner — the part with smaller crowds, side stages, and actual discovery — not the closer.",
      },
    ],
  },

  // ── Stubs for future iterations ─────────────────────────────────────────────
  millennials_urban: { key: "millennials_urban", name: "Urban Millennials", short: "25–34 · Metro · career-anchored, brand-conscious", stub: true },
  millennials_semiurban: { key: "millennials_semiurban", name: "Semi-Urban Millennials", short: "25–34 · T2/T3 · aspirational, family-pivot", stub: true },
  working_professionals: { key: "working_professionals", name: "Working Professionals", short: "26–40 · Metro · time-poor, premium-curious", stub: true },
  moms_urban: { key: "moms_urban", name: "Urban Moms", short: "28–42 · Metro · child-centric, quality-led", stub: true },
  moms_semiurban: { key: "moms_semiurban", name: "Semi-Urban Moms", short: "28–42 · T2/T3 · value-led, community-anchored", stub: true },
  moms_rural: { key: "moms_rural", name: "Rural Moms", short: "28–42 · Rural · TV/regional-media-led, family-first", stub: true },
};

export function getPersona(key) {
  return PERSONAS[key] || PERSONAS.urban_gen_z;
}

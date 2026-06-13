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

  // ── Urban Millennials (25–34 · Metro · career-anchored, brand-conscious) ───
  millennials_urban: {
    key: "millennials_urban",
    name: "Urban Millennials",
    short: "25–34 · Metro · career-anchored, brand-conscious",
    demographic: {
      age_range: [25, 34],
      gender_mix: { male: 0.50, female: 0.48, non_binary: 0.02 },
      city_tiers: ["metro"],
      cities: ["Mumbai", "Delhi NCR", "Bangalore", "Pune", "Hyderabad", "Chennai", "Kolkata", "Gurgaon"],
      sec: ["A1", "A2"],
      employment: ["mid-career", "senior-IC", "first-time-manager"],
    },
    psychographic: {
      values: { achievement: 0.85, status: 0.75, self_expression: 0.70, discovery: 0.65, belonging: 0.60, tradition: 0.35, rebellion_lite: 0.30 },
      motivations: [
        "balance career grind with quality unwinding",
        "premium experiences as reward, not flex",
        "rediscover music/sport/food after a focused decade",
        "build a peer group that's outgrown the bar scene",
      ],
      personality_axes: { openness: 0.70, social: 0.65, extroversion: 0.55, conscientious: 0.75 },
      tensions_active: ["work pressure vs. lifestyle", "premium taste vs. budget reality", "settled life vs. exploration"],
    },
    behavioural: {
      weights: {
        music_streaming: 1.3, festivals: 1.2, late_night_out: 1.4, food_delivery: 1.5,
        gaming_mobile: 0.9, digital_expresser: 1.0, social_identity: 1.1, cultural_explorer: 1.1,
        fashion_sneakers: 1.0, escapist_micro: 1.3, experience_maximiser: 1.5,
        cricket_watching: 1.2, group_socialiser: 1.2, travel_weekend: 1.5,
      },
      platforms: ["instagram", "youtube", "linkedin", "spotify", "swiggy", "zomato"],
      group_sizes: [2, 6],
      frequency_per_week_social: [1, 2],
      spend_pattern: "premium weekend + weekday after-work",
    },
    tensions: [
      {
        key: "work_lifestyle",
        statement: "Career pressure vs. lifestyle reward",
        proof_point_template: "{{count.food}} food-delivery signals + {{count.night}} late-night signals. Lead: \"{{top.food.query}}\".",
        reasoning: "The 'I earned this' moment matters more than the 'I'm out partying' moment. Order-in beats going-out; premium SKUs win over volume.",
      },
      {
        key: "experience_over_things",
        statement: "Experiences as the new status symbol",
        proof_point_template: "{{count.fest}} festival + {{count.travel_weekend}} weekend-travel signals. Lead: \"{{top.fest.query}}\" ({{top.fest.lift}}× lift).",
        reasoning: "Logos and luxury feel try-hard. Travel-weekend stories, sold-out shows, and 'small-table' restaurants are the new currency. The flex is the receipt of a Magnetic Fields ticket, not a handbag.",
      },
      {
        key: "premium_taste_budget",
        statement: "Premium taste vs. budget reality",
        proof_point_template: "{{count.aesthetics}} curated-content signals + {{count.cultural_explorer}} discovery signals.",
        reasoning: "Aspirational taste at attainable price points is the sweet spot. 'Better-than-the-default' wins — not 'top-of-the-pyramid.' Heineken-tier without Dom Perignon prices.",
      },
      {
        key: "rediscovery",
        statement: "Settled life vs. exploration impulse",
        proof_point_template: "{{count.cultural_explorer}} discovery signals. Top: \"{{top.cultural_explorer.query}}\".",
        reasoning: "The 30-year-old who once 'knew the scene' wants permission to rediscover. The brand role: surface what they would have liked at 22, in a 32-year-old format.",
      },
    ],
  },

  // ── Semi-Urban Millennials (25–34 · T2/T3 · aspirational) ──────────────────
  millennials_semiurban: {
    key: "millennials_semiurban",
    name: "Semi-Urban Millennials",
    short: "25–34 · T2/T3 · aspirational, family-pivot",
    demographic: {
      age_range: [25, 34],
      gender_mix: { male: 0.55, female: 0.43, non_binary: 0.02 },
      city_tiers: ["T2", "T3"],
      cities: ["Lucknow", "Indore", "Jaipur", "Bhopal", "Coimbatore", "Kochi", "Patna", "Ranchi", "Vizag"],
      sec: ["A2", "B1", "B2"],
      employment: ["regional-mid-career", "small-biz-owner", "govt-employee"],
    },
    psychographic: {
      values: { achievement: 0.80, tradition: 0.65, belonging: 0.80, status: 0.70, self_expression: 0.55, discovery: 0.45, rebellion_lite: 0.20 },
      motivations: [
        "be seen as having 'made it' — but on tier-2 terms",
        "afford metro-flavour experiences locally",
        "family + friend group as anchor",
        "religious / regional celebration > global moments",
      ],
      personality_axes: { openness: 0.55, social: 0.85, extroversion: 0.70, conscientious: 0.65 },
      tensions_active: ["tier-2 vs. metro identity", "tradition vs. modern", "value vs. brand"],
    },
    behavioural: {
      weights: {
        music_streaming: 1.1, festivals: 1.0, late_night_out: 1.1, food_delivery: 1.4,
        gaming_mobile: 1.3, digital_expresser: 1.0, social_identity: 1.3, cultural_explorer: 0.7,
        fashion_sneakers: 0.9, escapist_micro: 1.1, experience_maximiser: 1.2,
        cricket_watching: 1.7, group_socialiser: 1.5, travel_weekend: 1.3,
      },
      platforms: ["youtube", "instagram", "moj", "sharechat", "swiggy"],
      group_sizes: [3, 10],
      frequency_per_week_social: [2, 4],
      spend_pattern: "festive bursts + steady weekend",
    },
    tensions: [
      { key: "tier_metro", statement: "Tier-2 reality vs. metro aspiration",
        proof_point_template: "{{count.aesthetics}} digital-expression signals + {{count.fest}} festival signals.",
        reasoning: "Doesn't want to leave home city — wants metro experiences delivered to it. 'Make my city feel like Mumbai for one weekend' is the brief." },
      { key: "trad_modern", statement: "Tradition as backbone, modernity as expression",
        proof_point_template: "{{count.fest}} festival + {{count.food}} food signals.",
        reasoning: "Regional festivals and family rituals are not eroding — they're upgrading. New formats, branded properties on familiar occasions." },
      { key: "value_brand", statement: "Value-for-money vs. recognisable-brand",
        proof_point_template: "{{count.cricket}} cricket + {{count.food}} food-delivery signals.",
        reasoning: "Brand matters as social signal, but only at a price point that doesn't feel like waste. Strong-name + accessible-price wins; premium-only loses." },
      { key: "group_belonging", statement: "Friend-group / extended-family ritual",
        proof_point_template: "{{count.night}} group-socialising signals. Top: \"{{top.night.query}}\".",
        reasoning: "The audience is rarely alone. Every brand moment is a 4-10 person decision. Group-formats outperform solo-formats." },
    ],
  },

  // ── Working Professionals (26–40 · Metro · time-poor, premium-curious) ─────
  working_professionals: {
    key: "working_professionals",
    name: "Working Professionals",
    short: "26–40 · Metro · time-poor, premium-curious",
    demographic: {
      age_range: [26, 40],
      gender_mix: { male: 0.55, female: 0.43, non_binary: 0.02 },
      city_tiers: ["metro", "T1"],
      cities: ["Mumbai", "Bangalore", "Gurgaon", "Hyderabad", "Pune", "Chennai"],
      sec: ["A1", "A2"],
      employment: ["IC", "manager", "senior-manager", "founder/early-employee"],
    },
    psychographic: {
      values: { achievement: 0.90, status: 0.70, discovery: 0.55, self_expression: 0.55, belonging: 0.50, tradition: 0.40 },
      motivations: ["max output per hour", "quality time > quantity time", "premium fast-experiences", "switch off without going dark"],
      personality_axes: { openness: 0.65, social: 0.55, extroversion: 0.45, conscientious: 0.80 },
      tensions_active: ["time poverty vs. quality experience", "always-on vs. switch-off", "achievement vs. presence"],
    },
    behavioural: {
      weights: {
        music_streaming: 1.1, festivals: 0.9, late_night_out: 1.2, food_delivery: 1.7,
        gaming_mobile: 0.7, digital_expresser: 0.8, social_identity: 1.0, cultural_explorer: 1.0,
        fashion_sneakers: 0.9, escapist_micro: 1.5, experience_maximiser: 1.3,
        cricket_watching: 1.1, group_socialiser: 0.9, travel_weekend: 1.5,
      },
      platforms: ["instagram", "linkedin", "swiggy", "blinkit", "spotify"],
      group_sizes: [2, 4],
      frequency_per_week_social: [1, 2],
      spend_pattern: "premium-fast: pay more to save time",
    },
    tensions: [
      { key: "time_quality", statement: "Time poverty vs. quality experience",
        proof_point_template: "{{count.food}} delivery + {{count.escapist_micro}} micro-break signals.",
        reasoning: "Has 90 minutes between calls and won't trade them for mediocre. Premium fast-food, 10-minute Blinkit luxury, single-malt 1-drink moments win over 4-hour bar nights." },
      { key: "always_on_switch", statement: "Always-on vs. permission to switch off",
        proof_point_template: "{{count.escapist_micro}} micro-escape signals. Lead: \"{{top.escapist_or_night.query}}\".",
        reasoning: "Can't unplug for a weekend. Can unplug for 20 minutes after a deploy. Micro-rituals that signal 'I'm done for tonight' are the open territory." },
      { key: "achievement_presence", statement: "Achievement vs. being present",
        proof_point_template: "{{count.travel_weekend}} weekend-travel + {{count.fest}} festival signals.",
        reasoning: "Wants the 'I was there' AND the 'I lived it.' Concert + close friends + one bottle > festival + influencers + a thousand stories." },
    ],
  },

  // ── Urban Moms (28–42 · Metro · child-centric, quality-led) ────────────────
  moms_urban: {
    key: "moms_urban",
    name: "Urban Moms",
    short: "28–42 · Metro · child-centric, quality-led",
    demographic: {
      age_range: [28, 42],
      gender_mix: { female: 1.0 },
      city_tiers: ["metro", "T1"],
      cities: ["Mumbai", "Delhi NCR", "Bangalore", "Pune", "Chennai", "Hyderabad"],
      sec: ["A1", "A2"],
      employment: ["working-mother", "career-pause", "career-restart", "homemaker-by-choice"],
    },
    psychographic: {
      values: { belonging: 0.85, achievement: 0.70, tradition: 0.55, self_expression: 0.60, discovery: 0.55, status: 0.45 },
      motivations: ["child wellbeing first", "small windows of 'me-time'", "trusted/clean/quality > novelty", "community of other moms"],
      personality_axes: { openness: 0.60, social: 0.75, extroversion: 0.55, conscientious: 0.85 },
      tensions_active: ["self vs. family", "tradition vs. modern parenting", "convenience vs. quality"],
    },
    behavioural: {
      weights: {
        music_streaming: 0.9, festivals: 0.8, late_night_out: 0.7, food_delivery: 1.6,
        gaming_mobile: 0.4, digital_expresser: 0.7, social_identity: 0.9, cultural_explorer: 0.8,
        fashion_sneakers: 0.6, escapist_micro: 1.5, experience_maximiser: 1.2,
        cricket_watching: 1.0, group_socialiser: 1.3, travel_weekend: 1.3,
      },
      platforms: ["instagram", "whatsapp-groups", "youtube", "swiggy", "amazon"],
      group_sizes: [2, 6],
      frequency_per_week_social: [1, 2],
      spend_pattern: "quality-first weekly + weekend treat",
    },
    tensions: [
      { key: "self_family", statement: "Self vs. family",
        proof_point_template: "{{count.escapist_micro}} micro-escape signals + {{count.food}} delivery signals.",
        reasoning: "Mom-coded marketing reduces women to roles. The opening is 'I'm also a person' — solo coffee, 30-minute book moment, friends over with snacks she didn't cook." },
      { key: "trad_modern_parenting", statement: "Traditional values vs. modern parenting",
        proof_point_template: "{{count.aesthetics}} curated-content signals + {{count.cultural_explorer}} discovery signals.",
        reasoning: "Grew up one way, raising kids another. Brands that respect both ('your mother's biscuit, your child's nutrition') outperform either pole." },
      { key: "convenience_quality", statement: "Convenience vs. quality",
        proof_point_template: "{{count.food}} food signals + {{count.fest}} family-event signals.",
        reasoning: "Swiggy-grade convenience with farm-grade ingredients is the unmet need. Premium-fast within the family lens." },
    ],
  },

  // ── Semi-Urban Moms (28–42 · T2/T3 · value-led, community-anchored) ────────
  moms_semiurban: {
    key: "moms_semiurban",
    name: "Semi-Urban Moms",
    short: "28–42 · T2/T3 · value-led, community-anchored",
    demographic: {
      age_range: [28, 42],
      gender_mix: { female: 1.0 },
      city_tiers: ["T2", "T3"],
      cities: ["Lucknow", "Jaipur", "Indore", "Coimbatore", "Bhopal", "Vizag", "Kanpur", "Patna"],
      sec: ["B1", "B2", "C1"],
      employment: ["homemaker", "small-business-helper", "primary-school-teacher", "tuition"],
    },
    psychographic: {
      values: { tradition: 0.85, belonging: 0.90, achievement: 0.60, status: 0.55, self_expression: 0.40, discovery: 0.30 },
      motivations: ["children's education and future", "respect within extended family", "festive ritual continuity", "value-conscious choices"],
      personality_axes: { openness: 0.40, social: 0.85, extroversion: 0.60, conscientious: 0.85 },
      tensions_active: ["modern aspirations on a tight budget", "individual identity vs. role", "tradition vs. exposure"],
    },
    behavioural: {
      weights: {
        music_streaming: 1.0, festivals: 1.2, late_night_out: 0.4, food_delivery: 0.9,
        gaming_mobile: 0.3, digital_expresser: 0.9, social_identity: 1.0, cultural_explorer: 0.5,
        fashion_sneakers: 0.5, escapist_micro: 1.0, experience_maximiser: 0.8,
        cricket_watching: 1.4, group_socialiser: 1.6, travel_weekend: 1.1,
      },
      platforms: ["whatsapp-groups", "youtube", "sharechat", "moj", "instagram"],
      group_sizes: [4, 12],
      frequency_per_week_social: [3, 5],
      spend_pattern: "festive + family-occasion bursts; weekly value spend",
    },
    tensions: [
      { key: "modern_budget", statement: "Modern aspirations vs. tight budget",
        proof_point_template: "{{count.fest}} festival + {{count.food}} family-food signals.",
        reasoning: "Sees metro lifestyles on Instagram but lives a Rs.40K-monthly reality. Brands that bridge — branded value SKUs, mini-formats — clean up." },
      { key: "role_identity", statement: "'Mom' role vs. individual identity",
        proof_point_template: "{{count.aesthetics}} digital-self signals.",
        reasoning: "The 30-minute Reels window after kids sleep is where her individual self comes back. Catch her there, not at school pickup." },
      { key: "tradition_exposure", statement: "Traditional life with new exposure",
        proof_point_template: "{{count.cultural_explorer}} discovery signals + {{count.cricket}} cricket signals.",
        reasoning: "Same household, new ideas about food, education, parenting. Brands that respect the old format while gently introducing new content win the WhatsApp share." },
    ],
  },

  // ── Rural Moms (28–42 · Rural · TV/regional-media-led, family-first) ───────
  moms_rural: {
    key: "moms_rural",
    name: "Rural Moms",
    short: "28–42 · Rural · TV / regional-media-led, family-first",
    demographic: {
      age_range: [28, 42],
      gender_mix: { female: 1.0 },
      city_tiers: ["rural"],
      cities: ["villages and small towns across India"],
      sec: ["B2", "C1", "C2", "D"],
      employment: ["homemaker", "farm-help", "self-employed-cottage", "anganwadi-helper"],
    },
    psychographic: {
      values: { belonging: 0.95, tradition: 0.95, achievement: 0.55, self_expression: 0.30, status: 0.45, discovery: 0.20 },
      motivations: ["child education = ladder out", "respect from in-laws and community", "religious / festival ritual", "secure food and health"],
      personality_axes: { openness: 0.30, social: 0.90, extroversion: 0.55, conscientious: 0.90 },
      tensions_active: ["aspirations vs. constraint", "tradition vs. exposure via media", "village identity vs. emigrating youth"],
    },
    behavioural: {
      weights: {
        music_streaming: 1.0, festivals: 1.4, late_night_out: 0.1, food_delivery: 0.3,
        gaming_mobile: 0.3, digital_expresser: 0.6, social_identity: 0.7, cultural_explorer: 0.4,
        fashion_sneakers: 0.3, escapist_micro: 1.0, experience_maximiser: 0.6,
        cricket_watching: 1.6, group_socialiser: 1.6, travel_weekend: 0.6,
      },
      platforms: ["youtube", "whatsapp-groups", "moj", "regional-TV", "fm-radio"],
      group_sizes: [5, 20],
      frequency_per_week_social: [5, 7],
      spend_pattern: "monthly cycle + festive splurges + emergency",
    },
    tensions: [
      { key: "aspiration_constraint", statement: "Big aspirations for kids vs. tight constraints today",
        proof_point_template: "{{count.fest}} festive signals + {{count.cricket}} cricket signals.",
        reasoning: "Cricket is the village stadium. Festivals are the year's calendar. Brands that respect both rather than imposing metro values land deeper." },
      { key: "media_tradition", statement: "Traditional life with media exposure",
        proof_point_template: "{{count.cultural_explorer}} discovery signals + {{count.aesthetics}} content signals.",
        reasoning: "YouTube and WhatsApp brought the metro into the village living room. New behaviours emerge faster than the family can adopt them. The bridge is the play." },
      { key: "village_emigration", statement: "Village identity vs. emigrating youth",
        proof_point_template: "{{count.fest}} festival + {{count.cricket}} cricket signals.",
        reasoning: "Children leaving for metros is both pride and loss. Brand role: be the proof that the village still matters — Diwali courier, IPL viewing in the village square." },
    ],
  },
};

export function getPersona(key) {
  return PERSONAS[key] || PERSONAS.urban_gen_z;
}

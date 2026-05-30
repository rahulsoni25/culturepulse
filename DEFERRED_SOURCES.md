# Cultural Listening Sources — Status & Roadmap

> Honest snapshot of every source we considered, what each unlocks, and what's
> needed to enable it. The point: never promise coverage we can't deliver, and
> never let a missing source silently leave gaps in the brief.

## ✅ LIVE NOW (free, no setup)

| Source | What it surfaces | How wired |
|---|---|---|
| **Google Trends India RSS** | Daily rising search queries with traffic counts | `api/signals.js → fetchGoogleTrendsIN` |
| **Google News India** (per topic) | Editorial framing of cultural topics, ≤7d window | `api/signals.js → fetchNews` (9 default query lanes) |
| **Wikipedia most-read (India-filtered)** | What audiences are looking up | `api/signals.js → fetchWikipediaTop` |
| **Reddit Atom feeds** (14 subs) | Where Indian audiences actually post: bollywood, hip-hop, food, gaming, cricket, cities, streetwear, memes, Gen Z | `api/sources-social.js → fetchRedditAll` |
| **YouTube channel RSS** (10 channels) | T-Series, Sony Music, Mass Appeal, OML, Curly Tales, Cricbuzz, etc. — last 2 weeks of uploads | `api/sources-social.js → fetchYouTubeAll` |
| **Hacker News (India-tagged)** | Cross-cut digital culture, opt-in via reviewer | `api/sources-extra.js → fetchHackerNews` |
| **Evergreen pool** (35 perennial signals) | Backstop when live data is thin (IPL season, Diwali, indie venues, etc.) | `api/sources-evergreen.js` |

## ⚠️ DEFERRED — needs a key / OAuth / paid tier

Each entry lists exactly what's needed to enable it. If you supply the
credentials, wiring is ~30-60 minutes of work each.

### YouTube Data API v3 — *recommended next*

What we'd add beyond channel RSS: regional **trending** videos (chart =
`mostPopular`, regionCode = `IN`), **search by query** with view-count sort,
and top-**comment** mining on Indian music videos.

- **Need:** YouTube Data API key (free tier 10,000 units/day; one call ≈ 1 unit)
- **Setup:** [Google Cloud Console](https://console.cloud.google.com/) → enable YouTube Data API v3 → create API Key (no OAuth needed for read-only)
- **Env var:** `YOUTUBE_API_KEY`
- **Lens lift:** much stronger `music_streaming`, `digital_expresser`, `cultural_explorer`

### Spotify Web API (Client Credentials flow)

What it gives: Viral 50 India, Top 50 India, audio-feature breakdowns of
trending tracks, related-artist graphs. Music tribes become quantifiable.

- **Need:** Spotify app registration (free, no business account)
- **Setup:** [developer.spotify.com](https://developer.spotify.com/dashboard) → Create app → grab `client_id` + `client_secret`. App needs to remain in dev mode unless you want to enable user-OAuth; client-credentials covers what we need.
- **Env vars:** `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
- **Lens lift:** strongest possible `music_streaming` + `discovery_culture`

### Last.fm API

Tracks tribal listening overlap ("people who listen to DIVINE also listen
to…"), top tracks by country, tag-based scrobbling counts.

- **Need:** Last.fm API key (free, no business)
- **Setup:** [last.fm/api/account/create](https://www.last.fm/api/account/create)
- **Env var:** `LASTFM_API_KEY`
- **Lens lift:** `music_streaming`, `scene_individual`, `cultural_explorer`

### Pinterest Trends API

What it gives: forward-looking aesthetic trends — fashion / beauty / food /
wedding / festive design. Pinterest leads taste 3-6 months before TikTok.

- **Need:** Pinterest **business account** + OAuth app + Trends-API approval
- **Setup:** [developers.pinterest.com](https://developers.pinterest.com/) — business verification can take 5-10 days
- **Env vars:** `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`, `PINTEREST_REFRESH_TOKEN`
- **Lens lift:** `fashion_sneakers`, `curated_real`, `festival_culture` (festive design)
- **Honest note:** the approval gate is real. Skip unless beauty/fashion is a primary client lens.

### Instagram Graph API (hashtag search)

What it gives: hashtag-volume tracking, recent-media for hashtags
(India-relevant: #indianhiphop, #indianstreetwear, #bombayfoodie).

- **Need:** Facebook Developer App + Instagram **Business** account
  connected + app review for `instagram_basic` + `pages_show_list` + the
  hashtag search scope
- **Setup:** [developers.facebook.com](https://developers.facebook.com/) — app review can take 7-30 days
- **Env vars:** `IG_ACCESS_TOKEN`, `IG_USER_ID`
- **Lens lift:** `digital_expresser`, `social_identity`, `scene_individual`
- **Honest note:** highest-friction setup of any source here. Worth it only after PoC client.

### X (formerly Twitter)

Free tier closed in 2023. Read-access starts at Pro tier — **\$200/month**
for 10K reads/month — which is barely useful for cultural listening at scale.

- **Need:** Paid X API subscription (Pro \$200/mo minimum)
- **Recommendation:** **skip**. Most cultural conversation that mattered
  on Twitter has fragmented to Reddit, Instagram comment threads, and
  Discord since 2024. The cost/value ratio is bad.

### Pushshift / Reddit historical archives

Effectively dead since the 2023 Reddit API changes. The live Atom feeds
we already pull are the best Reddit data available without OAuth.

## 🌐 INDIAN-VERNACULAR SOURCES (the wedge)

This is where the real differentiation lives — and where competitors are
weakest. None of these have clean public APIs; each needs a different
approach.

| Source | Why it matters | Status |
|---|---|---|
| **ShareChat** | T2/T3 Hindi/regional vernacular content engine | No public API. Web scraping risky. Would need partnership. |
| **Moj** | Short-form video for non-English India | No public API. |
| **Dailyhunt** | Hindi/regional aggregated news at scale | No public API. RSS lanes available for specific categories — wirable. |
| **Inshorts** | Bite-sized news consumption for young India | No public API. |
| **JioSaavn / Gaana** | Where most of India actually streams music | JioSaavn has an unofficial wrapper (community-maintained). Worth piloting for the music lens. |
| **Pratilipi / YourQuote** | Hindi long-form + microliterature | Each has a Web Audio API for read-counts; cultural-strategy signal but not real-time. |
| **BookMyShow** | India's actual nightlife / cinema pulse | No public API. Could pull event listings via web scraping if needed. |

Most legacy "culture intelligence" tools (Brandwatch, Talkwalker, Sprinklr)
are functionally blind to non-English India. **This is the moat. Building
listening for these in v2 is what unlocks the India-first promise.**

## How the reviewer agent uses this

The reviewer scores `signal_pool` and `source-diversity` against the LIVE
set. If a brand × persona combo is genuinely under-served by what's wired
(e.g. fashion brand × millennials but Pinterest isn't enabled), the
agent's iteration log will say so — instead of pretending coverage.

Adding any of the deferred sources above will lift the loop's ceiling
permanently. Each one is a distinct PR — small, isolated, testable.

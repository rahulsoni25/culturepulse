// api/sources-spotify.js
// ──────────────────────────────────────────────────────────────────────────────
// SPOTIFY WEB API (key-gated, Client-Credentials flow)
//
// Pulls India music behaviour: the editorial/algorithmic India playlists
// (Top 50 — India, Viral 50 — India, Hot Hits Hindi, etc.). Each track is a
// music_streaming signal; the playlist it came from tells us the cultural slice.
//
// DORMANT until SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET are set. With no
// credentials it returns [] — production behaviour unchanged.
//
// Get credentials: https://developer.spotify.com/dashboard → Create app →
// copy Client ID + Client Secret. Client-Credentials flow needs no user login.
//
// Env: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
// ──────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 6000;

// Well-known India playlist IDs (Spotify-owned, stable).
const INDIA_PLAYLISTS = [
  { id: "37i9dQZEVXbLZ52XmnySJg", name: "Top 50 — India",     lens: "music_streaming" },
  { id: "37i9dQZEVXbMWDif5SCBJq", name: "Viral 50 — India",   lens: "cultural_explorer" },
  { id: "37i9dQZF1DX0XUfTFmNBRM", name: "Hot Hits Hindi",     lens: "music_streaming" },
];

// In-memory token cache (per warm lambda). Avoids re-auth on every call.
let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  // Reuse cached token if still valid (with 30s safety margin).
  if (_token && Date.now() < _tokenExpiry - 30000) return _token;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      },
      body: "grant_type=client_credentials",
    });
    if (!r.ok) return null;
    const j = await r.json();
    _token = j.access_token;
    _tokenExpiry = Date.now() + (j.expires_in || 3600) * 1000;
    return _token;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function spotifyAvailable() {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function fetchPlaylistTracks(token, { id, name, lens }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(
      `https://api.spotify.com/v1/playlists/${id}/tracks?limit=10&fields=items(track(name,popularity,artists(name),external_urls))`,
      { signal: ctrl.signal, headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) return [];
    const j = await r.json();
    const items = j?.items || [];
    return items.slice(0, 6).map((it, i) => {
      const tr = it.track || {};
      const artist = (tr.artists || []).map((a) => a.name).join(", ");
      // Spotify popularity (0-100) → lift 55-92.
      const pop = tr.popularity || 0;
      const lift = Math.min(92, Math.max(55, Math.round(55 + pop * 0.37)));
      return {
        query: `${tr.name || ""} — ${artist}`.slice(0, 140),
        cat: `Spotify · ${name}`,
        lift,
        signal: lens,
        city: "India",
        source: "spotify",
        playlist: name,
        rank: i + 1,
        popularity: pop,
        url: tr.external_urls?.spotify || null,
        hours_ago: 0,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export async function fetchSpotifyIndia() {
  if (!spotifyAvailable()) return []; // dormant without credentials
  const token = await getToken();
  if (!token) return [];
  try {
    const batches = await Promise.all(INDIA_PLAYLISTS.map((p) => fetchPlaylistTracks(token, p)));
    return batches.flat();
  } catch {
    return [];
  }
}

/**
 * Spotify helpers for the per-product song.
 *
 * - Pasting a track link works with no setup: title/artwork come from Spotify's
 *   public oEmbed endpoint and the artist from the track page's meta tags.
 * - Searching by name needs a Spotify app (client-credentials flow). Set
 *   SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET as Worker secrets to enable it.
 *
 * Lookups are best-effort: whatever can't be fetched is left blank, because the
 * storefront only needs the track link to embed the player.
 */

export interface SpotifySong {
  title: string;
  artist: string;
  artwork_url: string;
  url: string;
}

const TRACK_RE = /open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})/;

export function parseTrackId(input: string): string | null {
  const m = TRACK_RE.exec(input.trim());
  if (m) return m[1]!;
  const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(input.trim());
  return uri ? uri[1]! : null;
}

const trackUrl = (id: string) => `https://open.spotify.com/track/${id}`;

let cachedToken: { value: string; expires: number } | null = null;

function credentials(): { id: string; secret: string } | null {
  const id = process.env["SPOTIFY_CLIENT_ID"];
  const secret = process.env["SPOTIFY_CLIENT_SECRET"];
  return id && secret ? { id, secret } : null;
}

export function spotifySearchConfigured(): boolean {
  return credentials() !== null;
}

async function accessToken(): Promise<string | null> {
  const creds = credentials();
  if (!creds) return null;
  if (cachedToken && cachedToken.expires > Date.now() + 30_000) return cachedToken.value;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${creds.id}:${creds.secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify authentication failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

interface ApiTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  external_urls: { spotify: string };
}

function fromApi(t: ApiTrack): SpotifySong {
  return {
    title: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    artwork_url: t.album.images[1]?.url ?? t.album.images[0]?.url ?? "",
    url: t.external_urls.spotify || trackUrl(t.id),
  };
}

export async function searchSpotifyTracks(query: string): Promise<SpotifySong[]> {
  const token = await accessToken();
  if (!token) return [];
  const res = await fetch(
    `https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Spotify search failed (${res.status})`);
  const json = (await res.json()) as { tracks?: { items?: ApiTrack[] } };
  return (json.tracks?.items ?? []).map(fromApi);
}

/** Resolve a pasted link to a song. Never throws for lookup failures. */
export async function lookupSpotifyTrack(input: string): Promise<SpotifySong> {
  const id = parseTrackId(input);
  if (!id) throw new Error("That doesn't look like a Spotify track link.");
  const url = trackUrl(id);
  const song: SpotifySong = { title: "", artist: "", artwork_url: "", url };

  try {
    const token = await accessToken();
    if (token) {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) return fromApi((await res.json()) as ApiTrack);
    }
  } catch {
    /* fall through to the public endpoints */
  }

  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const json = (await res.json()) as { title?: string; thumbnail_url?: string };
      song.title = json.title ?? "";
      song.artwork_url = json.thumbnail_url ?? "";
    }
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (res.ok) {
      const html = await res.text();
      // og:description looks like "Artist · Title · Song · 2019".
      const desc = /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/.exec(html)?.[1];
      const artist = desc?.split("·")[0]?.trim();
      if (artist) song.artist = artist.replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
    }
  } catch {
    /* ignore */
  }

  return song;
}

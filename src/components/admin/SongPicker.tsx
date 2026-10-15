import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { spotifyLookupFn, spotifySearchFn } from "@/lib/commerce.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface Song {
  title: string;
  artist: string;
  artwork_url: string;
  /** Spotify track link, e.g. https://open.spotify.com/track/<id> */
  url: string;
}

function embedUrl(url: string): string | null {
  const id = /track\/([A-Za-z0-9]{22})/.exec(url)?.[1];
  return id ? `https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0` : null;
}

/**
 * Pick the Spotify song for a product: paste a track link, or search by name
 * (search needs SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET to be configured).
 * The storefront embeds the Spotify player for the selected track.
 */
export function SongPicker({
  value,
  onChange,
}: {
  value: Song | null;
  onChange: (song: Song | null) => void;
}) {
  const lookup = useServerFn(spotifyLookupFn);
  const search = useServerFn(spotifySearchFn);

  const [link, setLink] = useState("");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<"link" | "search" | null>(null);
  const [results, setResults] = useState<Song[]>([]);
  const [note, setNote] = useState<string | null>(null);

  async function useLink() {
    if (!link.trim()) return;
    setBusy("link");
    setNote(null);
    try {
      const song = await lookup({ data: { url: link } });
      onChange(song);
      setLink("");
      setResults([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that link");
    } finally {
      setBusy(null);
    }
  }

  async function runSearch() {
    if (!term.trim()) return;
    setBusy("search");
    setNote(null);
    try {
      const r = await search({ data: { query: term } });
      if (!r.configured) {
        setResults([]);
        setNote(
          "Search isn't set up yet (needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET). Paste a Spotify track link above instead.",
        );
      } else {
        setResults(r.tracks);
        if (r.tracks.length === 0) setNote("No songs found — try another search.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }

  const embed = value ? embedUrl(value.url) : null;

  return (
    <div className="space-y-3">
      {value ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            {value.artwork_url ? (
              <img src={value.artwork_url} alt="" className="h-12 w-12 rounded-md object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-md bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{value.title || "Spotify track"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {value.artist || value.url}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => onChange(null)}
              aria-label="Remove song"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {embed && (
            <iframe
              title="Spotify preview"
              src={embed}
              width="100%"
              height="80"
              allow="encrypted-media"
              loading="lazy"
              className="rounded-md border-0"
            />
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No song selected.</p>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Paste a Spotify track link — https://open.spotify.com/track/…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void useLink();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void useLink()}>
          <Link2 className="h-4 w-4" />
          {busy === "link" ? "Reading…" : "Use link"}
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="…or search Spotify by song or artist"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void runSearch()}>
          <Search className="h-4 w-4" />
          {busy === "search" ? "Searching…" : "Search"}
        </Button>
      </div>

      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      {results.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {results.map((t) => (
            <li key={t.url} className="flex items-center gap-3 p-2">
              {t.artwork_url ? (
                <img src={t.artwork_url} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="h-10 w-10 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{t.title}</p>
                <p className="truncate text-xs text-muted-foreground">{t.artist}</p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onChange(t);
                  setResults([]);
                  setTerm("");
                }}
              >
                Select
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

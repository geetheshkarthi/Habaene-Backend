import { useEffect, useRef, useState } from "react";
import { Pause, Play, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface Song {
  title: string;
  artist: string;
  artwork_url: string;
  preview_url: string;
  url: string;
}

interface ItunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackViewUrl?: string;
}

function toSong(t: ItunesTrack): Song {
  return {
    title: t.trackName,
    artist: t.artistName,
    artwork_url: (t.artworkUrl100 ?? "").replace("100x100", "300x300"),
    preview_url: t.previewUrl ?? "",
    url: t.trackViewUrl ?? "",
  };
}

/**
 * Pick one song for a product. Searches Apple's public iTunes Search API (no
 * key needed) and stores the track's title, artist, artwork and 30-second
 * preview URL on the product, which the storefront plays on the product page.
 */
export function SongPicker({
  value,
  onChange,
}: {
  value: Song | null;
  onChange: (song: Song | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ItunesTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = new Audio();
    el.onended = () => setPlaying(null);
    audio.current = el;
    return () => {
      el.pause();
      audio.current = null;
    };
  }, []);

  async function search() {
    const q = term.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=10`,
      );
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = (await res.json()) as { results?: ItunesTrack[] };
      const tracks = (data.results ?? []).filter((t) => t.previewUrl);
      setResults(tracks);
      if (tracks.length === 0) setError("No playable songs found — try another search.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function togglePreview(url: string) {
    const el = audio.current;
    if (!el || !url) return;
    if (playing === url) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = url;
    el.play().then(
      () => setPlaying(url),
      () => setPlaying(null),
    );
  }

  function choose(t: ItunesTrack) {
    audio.current?.pause();
    setPlaying(null);
    onChange(toSong(t));
    setResults([]);
    setTerm("");
  }

  return (
    <div className="space-y-3">
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          {value.artwork_url ? (
            <img src={value.artwork_url} alt="" className="h-14 w-14 rounded-md object-cover" />
          ) : (
            <div className="h-14 w-14 rounded-md bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.title}</p>
            <p className="truncate text-xs text-muted-foreground">{value.artist}</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!value.preview_url}
            onClick={() => togglePreview(value.preview_url)}
            aria-label="Play preview"
          >
            {playing === value.preview_url ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => {
              audio.current?.pause();
              setPlaying(null);
              onChange(null);
            }}
            aria-label="Remove song"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No song selected.</p>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Search a song or artist…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={searching} onClick={() => void search()}>
          <Search className="h-4 w-4" />
          {searching ? "Searching…" : "Search"}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {results.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {results.map((t) => (
            <li key={t.trackId} className="flex items-center gap-3 p-2">
              {t.artworkUrl100 ? (
                <img src={t.artworkUrl100} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="h-10 w-10 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{t.trackName}</p>
                <p className="truncate text-xs text-muted-foreground">{t.artistName}</p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => togglePreview(t.previewUrl ?? "")}
                aria-label="Play preview"
              >
                {playing === t.previewUrl ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <Button type="button" size="sm" onClick={() => choose(t)}>
                Select
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

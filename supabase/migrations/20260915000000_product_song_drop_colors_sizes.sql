-- Products: per-product Spotify song (embedded as the "Get into the mood"
-- player on the storefront product page) and removal of colour / size options.
--
-- Run this in the Supabase SQL editor BEFORE deploying the matching admin /
-- API release: the new code selects the song_* columns.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS song_title       text,
  ADD COLUMN IF NOT EXISTS song_artist      text,
  ADD COLUMN IF NOT EXISTS song_artwork_url text,
  ADD COLUMN IF NOT EXISTS song_url         text;  -- https://open.spotify.com/track/<id>

-- Irreversible: existing colour / size values are discarded.
ALTER TABLE public.products
  DROP COLUMN IF EXISTS colors,
  DROP COLUMN IF EXISTS sizes;

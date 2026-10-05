-- The real storefront hero is a multi-slide carousel (image + eyebrow +
-- heading + sub text per slide), not the single hero_heading/hero_images
-- fields cms_homepage already had — those were built for a different, never
-- -shipped hero design and the carousel's content has been hardcoded in
-- app.js ever since. This adds the structure the real component needs.

ALTER TABLE public.cms_homepage
  ADD COLUMN IF NOT EXISTS hero_slides jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS homepage_reviews_count integer NOT NULL DEFAULT 8;

-- Seed with the 3 slides currently hardcoded in app.js, so the storefront
-- renders identically until an admin actually changes something.
UPDATE public.cms_homepage
SET hero_slides = '[
  {"image_url": "assets/new_hero/Homepage_Images/hero_1_clean.png", "eyebrow": "01 / SIGNATURE CARRY", "heading": "Travel<br><em>Intelligently.</em>", "sub": "Fifteen objects engineered as one coherent movement system."},
  {"image_url": "assets/new_hero/Homepage_Images/hero_2_clean.png", "eyebrow": "02 / CITY TO CITY", "heading": "Travel<br><em>Intelligently.</em>", "sub": "Water-repellent canvas, vault-grade hardware, lifetime service paths."},
  {"image_url": "assets/new_hero/Homepage_Images/hero_3_clean.png", "eyebrow": "03 / DEPARTURE READY", "heading": "Travel<br><em>Intelligently.</em>", "sub": "Modular systems that adapt from a weekend to a full departure."}
]'::jsonb,
homepage_reviews_count = 8
WHERE singleton = true AND hero_slides = '[]'::jsonb;

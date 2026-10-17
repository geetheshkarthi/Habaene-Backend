-- "What are you moving toward?" homepage section, editable from
-- Content -> Find Your Object. Stored as JSON on the homepage singleton.
ALTER TABLE public.cms_homepage
  ADD COLUMN IF NOT EXISTS matcher jsonb;

NOTIFY pgrst, 'reload schema';

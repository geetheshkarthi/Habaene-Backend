-- Every signed-up/logged-in user (Google or email OTP) should appear on the
-- Customers admin page immediately, not only after their first order. Today
-- public.customers rows are only ever created at checkout, so a logged-in
-- customer with no completed order is invisible in admin — exactly what was
-- reported ("in all customers i have test but i dont had mine").

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_auth_user_id ON public.customers(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Needed so new-signup upserts can target the existing guest-checkout row
-- (same email) instead of creating a duplicate customer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique ON public.customers(email);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  full_name text := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '');
  first text := NULLIF(split_part(full_name, ' ', 1), '');
  rest text := NULLIF(trim(substring(full_name from length(split_part(full_name, ' ', 1)) + 1)), '');
BEGIN
  INSERT INTO public.customers (email, first_name, last_name, auth_user_id, gdpr_consent_at)
  VALUES (NEW.email, COALESCE(first, ''), COALESCE(rest, ''), NEW.id, NEW.created_at)
  ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id
  WHERE public.customers.auth_user_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill: link/create customers for everyone who already signed up before
-- this trigger existed.
INSERT INTO public.customers (email, first_name, last_name, auth_user_id, gdpr_consent_at)
SELECT
  u.email,
  COALESCE(NULLIF(split_part(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), ' ', 1), ''), ''),
  COALESCE(NULLIF(trim(substring(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') from length(split_part(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), ' ', 1)) + 1)), ''), ''),
  u.id,
  u.created_at
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id
WHERE public.customers.auth_user_id IS NULL;

-- Fix auth users created via seed SQL (missing identities) and auto-confirm
-- @sentinelops.app addresses used by username-based login.

-- 1. Auto-confirm existing @sentinelops.app users
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at         = now()
WHERE email LIKE '%@sentinelops.app'
  AND email_confirmed_at IS NULL;

-- 2. Create missing auth.identities for email users (required by GoTrue login)
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object(
    'sub',            u.id::text,
    'email',          u.email,
    'email_verified', u.email_confirmed_at IS NOT NULL
  ),
  'email',
  now(),
  now(),
  now()
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
  );

-- 3. Ensure profiles exist for all auth users
INSERT INTO public.profiles (id, email, role, username)
SELECT
  u.id,
  u.email,
  CASE WHEN u.email = 'admin@sentinelops.app' THEN 'admin'::public.user_role
       ELSE 'user'::public.user_role END,
  CASE WHEN u.email = 'admin@sentinelops.app' THEN 'admin'
       ELSE NULLIF(u.raw_user_meta_data->>'username', '') END
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- 4. Ensure admin profile has correct role/username
UPDATE public.profiles
SET username   = 'admin',
    role       = 'admin',
    updated_at = now()
WHERE id IN (SELECT id FROM auth.users WHERE email = 'admin@sentinelops.app');

-- 5. Auto-confirm @sentinelops.app on future signups (demo usernames have no inbox)
CREATE OR REPLACE FUNCTION public.auto_confirm_sentinelops_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NEW.email LIKE '%@sentinelops.app' THEN
    NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_confirm_sentinelops_emails ON auth.users;
CREATE TRIGGER auto_confirm_sentinelops_emails
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_sentinelops_emails();

-- 6. Store username from signup metadata in profiles
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role, username)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'::public.user_role,
    NULLIF(NEW.raw_user_meta_data->>'username', '')
  );
  RETURN NEW;
END;
$$;

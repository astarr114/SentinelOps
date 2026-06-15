-- Promote the admin account after it is created via Supabase Auth signup API.
-- Do NOT insert directly into auth.users — GoTrue login requires API-created users.
--
-- Create admin first (once):
--   email: admin@sentinelops.app
--   password: 12345678
--   username metadata: admin
--
-- Then run this script to grant the admin role:
UPDATE public.profiles
SET username   = 'admin',
    role       = 'admin',
    updated_at = now()
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@sentinelops.app');

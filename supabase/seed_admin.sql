-- Create admin user with username=admin and the given password
DO $$
DECLARE
  v_uid uuid;
BEGIN
  -- Insert into auth.users bypassing email confirmation
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, is_anonymous
  )
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@sentinelops.app',
    crypt('S3ntin3l$Ops#Admin2026!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false, false, false
  )
  ON CONFLICT ON CONSTRAINT users_email_partial_key DO UPDATE
    SET encrypted_password = crypt('S3ntin3l$Ops#Admin2026!', gen_salt('bf')),
        email_confirmed_at = now(),
        updated_at = now()
  RETURNING id INTO v_uid;

  -- Update profile: set username=admin, role=admin
  UPDATE public.profiles
  SET username = 'admin',
      role = 'admin',
      updated_at = now()
  WHERE id = v_uid;

  RAISE NOTICE 'Admin user ready, id=%', v_uid;
END $$;

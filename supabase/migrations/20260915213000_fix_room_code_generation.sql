-- Supabase installs pgcrypto in the extensions schema. The SECURITY DEFINER
-- function uses a fixed, trusted search path so gen_random_bytes is resolvable.
alter function public.create_game(text, smallint, smallint, text[])
  set search_path = public, extensions;

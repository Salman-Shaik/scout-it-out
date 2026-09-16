create or replace function public.get_turn_card_code(target_game_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare current_game public.games; card_code text;
begin
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now();
  if current_game.id is null then return null; end if;
  if auth.uid() is null or (auth.uid() <> current_game.card_holder_user_id and
    (auth.uid() <> current_game.turn_user_id or
      (current_game.clue_roll is null and
        current_game.bonus_user_id is distinct from auth.uid())))
    then return null; end if;
  select country_codes[current_game.current_card_index + 1] into card_code
  from public.game_secrets where game_id = target_game_id;
  return card_code;
end; $$;

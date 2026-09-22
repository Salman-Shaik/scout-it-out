create or replace function public.submit_country_guess(target_game_id uuid, country_code text)
returns void language plpgsql security definer set search_path = public as $$
declare current_game public.games; guesser_name text;
begin
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now() for update;
  if current_game.id is null or current_game.turn_user_id <> auth.uid()
    then raise exception 'Only the current roller can submit a map guess'; end if;
  if current_game.clue_roll is null then raise exception 'Wait for the clue before guessing'; end if;
  if auth.uid() = any(current_game.map_guess_user_ids)
    then raise exception 'You already submitted a map guess this turn'; end if;
  if current_game.pending_guess_user_id is not null
    then raise exception 'Wait for the card holder to review the current guess'; end if;
  if country_code !~ '^[a-z]{2}$' then raise exception 'Invalid country'; end if;
  select name::text into guesser_name from public.game_players
    where game_id = target_game_id and user_id = auth.uid();
  if guesser_name is null then raise exception 'Player not found'; end if;
  update public.games set pending_guess_user_id = auth.uid(),
    pending_guess_code = country_code,
    map_guess_user_ids = array_append(map_guess_user_ids, auth.uid()),
    updated_at = now(), last_event = jsonb_build_object('type', 'country_guessed',
      'player_name', guesser_name, 'country_code', country_code, 'at', now())
  where id = target_game_id;
end; $$;

create or replace function public.reject_country_guess(target_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare current_game public.games; next_user uuid; guesser_name text; guessed_code text;
begin
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now() for update;
  if current_game.id is null or current_game.card_holder_user_id <> auth.uid()
    then raise exception 'Only the card holder can reject a guess'; end if;
  if current_game.pending_guess_user_id is null
    then raise exception 'There is no map guess to review'; end if;
  select name::text into guesser_name from public.game_players
    where game_id = target_game_id and user_id = current_game.pending_guess_user_id;
  guessed_code := current_game.pending_guess_code;
  next_user := public.next_guesser(target_game_id, current_game.turn_user_id,
    current_game.card_holder_user_id);
  update public.games set turn_user_id = next_user, turn_number = turn_number + 1,
    clue_roll = null, die_roll = null, bonus_type = null, bonus_user_id = null,
    token_used_this_turn = false, pending_guess_user_id = null,
    pending_guess_code = null, updated_at = now(),
    last_event = jsonb_build_object('type', 'guess_rejected',
      'player_name', guesser_name, 'country_code', guessed_code,
      'next_user_id', next_user, 'at', now())
  where id = target_game_id;
end; $$;

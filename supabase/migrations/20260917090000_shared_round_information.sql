alter table public.games
  add column map_guess_user_ids uuid[] not null default '{}';

create or replace function public.reset_map_guesses_on_new_turn()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.turn_number is distinct from old.turn_number then
    new.map_guess_user_ids := '{}';
  end if;
  return new;
end; $$;

create trigger reset_map_guesses_on_new_turn
before update on public.games
for each row execute function public.reset_map_guesses_on_new_turn();

create or replace function public.submit_country_guess(target_game_id uuid, country_code text)
returns void language plpgsql security definer set search_path = public as $$
declare current_game public.games; guesser_name text;
begin
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now() for update;
  if current_game.id is null or current_game.card_holder_user_id = auth.uid()
    then raise exception 'Only a guesser can submit a map guess'; end if;
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

create or replace function public.get_turn_card_code(target_game_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare current_game public.games; card_code text;
begin
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now();
  if current_game.id is null or not public.is_game_player(target_game_id)
    then return null; end if;
  if current_game.clue_roll is null and current_game.bonus_type is null
    then return null; end if;
  select country_codes[current_game.current_card_index + 1] into card_code
  from public.game_secrets where game_id = target_game_id;
  return card_code;
end; $$;

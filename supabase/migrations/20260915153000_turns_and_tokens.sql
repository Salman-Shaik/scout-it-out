alter table public.game_players
  add column age smallint check (age between 7 and 120),
  add column bonus_tokens integer not null default 0 check (bonus_tokens >= 0);

alter table public.games
  add column turn_user_id uuid,
  add column turn_number integer not null default 0,
  add column clue_roll smallint check (clue_roll between 1 and 6),
  add column token_used_this_turn boolean not null default false,
  add column bonus_type text check (bonus_type in ('flag', 'buzzword', 'reroll', 'continent')),
  add column bonus_user_id uuid;

drop function public.create_game(text, smallint, text[]);
drop function public.join_game(text, text);

create function public.create_game(
  player_name text, player_age smallint, target_score smallint,
  shuffled_country_codes text[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare new_game public.games; new_player public.game_players; existing_game public.games;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(player_name)) not between 1 and 30 then raise exception 'Enter a player name'; end if;
  if player_age not between 7 and 120 then raise exception 'Enter an age from 7 to 120'; end if;
  if target_score is not null and target_score not in (3, 5, 7, 10) then raise exception 'Invalid win target'; end if;
  if cardinality(shuffled_country_codes) <> 195 or
    (select count(distinct deck.code) from unnest(shuffled_country_codes) as deck(code)) <> 195
    then raise exception 'The country deck must contain 195 unique cards'; end if;
  perform public.remove_expired_game();
  select * into existing_game from public.games where singleton_slot = 1;
  if existing_game.id is not null then
    return jsonb_build_object('available', false,
      'retry_after_seconds', greatest(0, ceil(extract(epoch from existing_game.expires_at - now()))));
  end if;
  insert into public.games (room_code, host_user_id, win_target, card_holder_user_id)
  values (upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)), auth.uid(), target_score, auth.uid())
  returning * into new_game;
  insert into public.game_players (game_id, user_id, name, age)
  values (new_game.id, auth.uid(), trim(player_name), player_age) returning * into new_player;
  insert into public.game_secrets (game_id, country_codes)
  values (new_game.id, shuffled_country_codes);
  return jsonb_build_object('available', true, 'game_id', new_game.id,
    'room_code', new_game.room_code, 'player_id', new_player.id);
exception when unique_violation then
  select * into existing_game from public.games where singleton_slot = 1;
  if existing_game.id is null then raise; end if;
  return jsonb_build_object('available', false,
    'retry_after_seconds', greatest(0, ceil(extract(epoch from existing_game.expires_at - now()))));
end; $$;

create function public.join_game(join_code text, player_name text, player_age smallint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target_game public.games; new_player public.game_players;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(player_name)) not between 1 and 30 then raise exception 'Enter a player name'; end if;
  if player_age not between 7 and 120 then raise exception 'Enter an age from 7 to 120'; end if;
  perform public.remove_expired_game();
  select * into target_game from public.games
  where room_code = upper(trim(join_code)) and status = 'lobby' and expires_at > now()
  for update;
  if target_game.id is null then raise exception 'Room not found or already started'; end if;
  if (select count(*) from public.game_players where game_id = target_game.id) >= 6
    then raise exception 'Room is full (6 players)'; end if;
  insert into public.game_players (game_id, user_id, name, age)
  values (target_game.id, auth.uid(), trim(player_name), player_age) returning * into new_player;
  return jsonb_build_object('game_id', target_game.id, 'player_id', new_player.id);
end; $$;

create or replace function public.start_game(target_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare oldest uuid; first_roller uuid;
begin
  select user_id into oldest from public.game_players where game_id = target_game_id
  order by age desc, joined_at, id limit 1;
  select user_id into first_roller from public.game_players
  where game_id = target_game_id and user_id <> oldest
  order by joined_at, id limit 1;
  update public.games set status = 'active', card_holder_user_id = oldest,
    turn_user_id = first_roller, clue_roll = null, die_roll = null,
    updated_at = now(), last_event = jsonb_build_object('type', 'game_started', 'at', now())
  where id = target_game_id and host_user_id = auth.uid() and status = 'lobby'
    and expires_at > now()
    and (select count(*) from public.game_players where game_id = target_game_id) between 3 and 6
    and not exists (select 1 from public.game_players where game_id = target_game_id and age is null);
  if not found then raise exception 'Only the host can start a lobby with 3 to 6 players and ages'; end if;
end; $$;

create or replace function public.roll_die(target_game_id uuid)
returns smallint language plpgsql security definer set search_path = public as $$
declare rolled smallint := floor(random() * 6 + 1); roller_name text;
begin
  select name::text into roller_name from public.game_players
  where game_id = target_game_id and user_id = auth.uid();
  if roller_name is null then raise exception 'Player not found'; end if;
  update public.games set die_roll = rolled, clue_roll = rolled, updated_at = now(),
    last_event = jsonb_build_object('type', 'die_rolled', 'player_name', roller_name,
      'roll', rolled, 'at', now())
  where id = target_game_id and status = 'active' and expires_at > now()
    and turn_user_id = auth.uid() and card_holder_user_id <> auth.uid()
    and clue_roll is null;
  if not found then raise exception 'It is not your turn, or you already rolled'; end if;
  return rolled;
end; $$;

create function public.next_guesser(target_game_id uuid, current_user_id uuid, holder_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.game_players
  where game_id = target_game_id and user_id <> holder_id
  order by case when joined_at >
    (select joined_at from public.game_players where game_id = target_game_id
      and user_id = current_user_id) then 0 else 1 end, joined_at, id limit 1;
$$;

create function public.pass_turn(target_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare current_game public.games; next_user uuid;
begin
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now() for update;
  if current_game.id is null or current_game.card_holder_user_id <> auth.uid()
    then raise exception 'Only the card holder can pass a turn'; end if;
  if current_game.clue_roll is null then raise exception 'Wait for a die roll'; end if;
  next_user := public.next_guesser(target_game_id, current_game.turn_user_id,
    current_game.card_holder_user_id);
  update public.games set turn_user_id = next_user, turn_number = turn_number + 1,
    clue_roll = null, die_roll = null, bonus_type = null, bonus_user_id = null,
    token_used_this_turn = false, updated_at = now(),
    last_event = jsonb_build_object('type', 'turn_passed', 'at', now())
  where id = target_game_id;
end; $$;

create function public.use_bonus_token(target_game_id uuid, help_type text)
returns smallint language plpgsql security definer set search_path = public as $$
declare current_game public.games; rolled smallint; roller_name text;
begin
  if help_type not in ('flag', 'buzzword', 'reroll', 'continent')
    then raise exception 'Unknown bonus help'; end if;
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now() for update;
  if current_game.id is null or current_game.turn_user_id <> auth.uid()
    then raise exception 'Only the current player can use a token'; end if;
  if current_game.token_used_this_turn then raise exception 'Only one token per turn'; end if;
  if help_type = 'reroll' and current_game.clue_roll is null
    then raise exception 'Roll the die before using a re-roll token'; end if;
  update public.game_players set bonus_tokens = bonus_tokens - 1
    where game_id = target_game_id and user_id = auth.uid() and bonus_tokens > 0
    returning name::text into roller_name;
  if roller_name is null then raise exception 'No bonus tokens available'; end if;
  if help_type = 'reroll' then rolled := floor(random() * 6 + 1); end if;
  update public.games set token_used_this_turn = true,
    bonus_type = help_type, bonus_user_id = auth.uid(),
    clue_roll = coalesce(rolled, clue_roll), die_roll = coalesce(rolled, die_roll),
    updated_at = now(), last_event = jsonb_build_object('type', 'bonus_used',
      'player_name', roller_name, 'help_type', help_type, 'roll', rolled, 'at', now())
  where id = target_game_id;
  return rolled;
end; $$;

create function public.get_turn_card_code(target_game_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare current_game public.games; card_code text;
begin
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now();
  if current_game.id is null then return null; end if;
  if auth.uid() <> current_game.card_holder_user_id and
    (auth.uid() <> current_game.turn_user_id or current_game.clue_roll is null)
    then return null; end if;
  select country_codes[current_game.current_card_index + 1] into card_code
  from public.game_secrets where game_id = target_game_id;
  return card_code;
end; $$;

create or replace function public.award_point(target_game_id uuid, guessed_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare current_game public.games; winner public.game_players; next_index integer;
  next_holder uuid; next_roller uuid;
begin
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now() for update;
  if current_game.id is null or current_game.card_holder_user_id <> auth.uid()
    then raise exception 'Only the card holder can award a card'; end if;
  if current_game.clue_roll is null then raise exception 'Wait for a die roll'; end if;
  update public.game_players set score = score + 1, bonus_tokens = bonus_tokens + 1
  where game_id = target_game_id and user_id = guessed_user_id and user_id <> auth.uid()
  returning * into winner;
  if winner.id is null then raise exception 'Choose an eligible guesser'; end if;
  next_index := current_game.current_card_index + 1;
  select user_id into next_holder from public.game_players
    where game_id = target_game_id and joined_at >
      (select joined_at from public.game_players where game_id = target_game_id
        and user_id = auth.uid())
    order by joined_at, id limit 1;
  if next_holder is null then select user_id into next_holder from public.game_players
    where game_id = target_game_id order by joined_at, id limit 1; end if;
  next_roller := public.next_guesser(target_game_id, winner.user_id, next_holder);
  update public.games set
    singleton_slot = case when (win_target is not null and winner.score >= win_target)
      or next_index >= 195 then null else 1 end,
    status = case when (win_target is not null and winner.score >= win_target)
      or next_index >= 195 then 'finished' else 'active' end,
    winner_user_ids = case when win_target is not null and winner.score >= win_target
      then array[winner.user_id] when next_index >= 195 then
      (select array_agg(user_id) from public.game_players where game_id = target_game_id
        and score = (select max(score) from public.game_players where game_id = target_game_id))
      else '{}'::uuid[] end,
    current_card_index = next_index, card_holder_user_id = next_holder,
    turn_user_id = next_roller, turn_number = turn_number + 1,
    clue_roll = null, die_roll = null, token_used_this_turn = false,
    bonus_type = null, bonus_user_id = null, updated_at = now(),
    last_event = jsonb_build_object('type', 'point_awarded',
      'player_name', winner.name::text, 'score', winner.score, 'at', now())
  where id = target_game_id;
end; $$;

revoke execute on function public.create_game(text, smallint, smallint, text[]) from public;
revoke execute on function public.join_game(text, text, smallint) from public;
revoke execute on function public.next_guesser(uuid, uuid, uuid) from public;
revoke execute on function public.pass_turn(uuid) from public;
revoke execute on function public.use_bonus_token(uuid, text) from public;
revoke execute on function public.get_turn_card_code(uuid) from public;
grant execute on function public.create_game(text, smallint, smallint, text[]) to authenticated;
grant execute on function public.join_game(text, text, smallint) to authenticated;
grant execute on function public.pass_turn(uuid) to authenticated;
grant execute on function public.use_bonus_token(uuid, text) to authenticated;
grant execute on function public.get_turn_card_code(uuid) to authenticated;

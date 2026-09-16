alter table public.game_players
  add column flag_tokens integer not null default 0 check (flag_tokens >= 0),
  add column buzzword_tokens integer not null default 0 check (buzzword_tokens >= 0),
  add column continent_tokens integer not null default 0 check (continent_tokens >= 0),
  add column reroll_tokens integer not null default 0 check (reroll_tokens >= 0);

-- Preserve tokens earned before inventories became typed.
update public.game_players set flag_tokens = bonus_tokens where bonus_tokens > 0;

alter table public.games
  add column pending_guess_user_id uuid,
  add column pending_guess_code text check (pending_guess_code ~ '^[a-z]{2}$');

create or replace function public.pass_turn(target_game_id uuid)
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
    pending_guess_user_id = null, pending_guess_code = null,
    token_used_this_turn = false, updated_at = now(),
    last_event = jsonb_build_object('type', 'turn_passed', 'at', now())
  where id = target_game_id;
end; $$;

create or replace function public.use_bonus_token(target_game_id uuid, help_type text)
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

  update public.game_players set
    flag_tokens = flag_tokens - case when help_type = 'flag' then 1 else 0 end,
    buzzword_tokens = buzzword_tokens - case when help_type = 'buzzword' then 1 else 0 end,
    continent_tokens = continent_tokens - case when help_type = 'continent' then 1 else 0 end,
    reroll_tokens = reroll_tokens - case when help_type = 'reroll' then 1 else 0 end,
    bonus_tokens = greatest(0, bonus_tokens - 1)
  where game_id = target_game_id and user_id = auth.uid()
    and case help_type
      when 'flag' then flag_tokens
      when 'buzzword' then buzzword_tokens
      when 'continent' then continent_tokens
      when 'reroll' then reroll_tokens
    end > 0
  returning name::text into roller_name;
  if roller_name is null then raise exception 'You do not have that token'; end if;
  if help_type = 'reroll' then rolled := floor(random() * 6 + 1); end if;
  update public.games set token_used_this_turn = true,
    bonus_type = help_type, bonus_user_id = auth.uid(),
    clue_roll = coalesce(rolled, clue_roll), die_roll = coalesce(rolled, die_roll),
    updated_at = now(), last_event = jsonb_build_object('type', 'bonus_used',
      'player_name', roller_name, 'help_type', help_type, 'roll', rolled, 'at', now())
  where id = target_game_id;
  return rolled;
end; $$;

create or replace function public.submit_country_guess(target_game_id uuid, country_code text)
returns void language plpgsql security definer set search_path = public as $$
declare current_game public.games; guesser_name text;
begin
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now() for update;
  if current_game.id is null or current_game.card_holder_user_id = auth.uid()
    then raise exception 'Only a guesser can submit a map guess'; end if;
  if country_code !~ '^[a-z]{2}$' then raise exception 'Invalid country'; end if;
  select name::text into guesser_name from public.game_players
    where game_id = target_game_id and user_id = auth.uid();
  if guesser_name is null then raise exception 'Player not found'; end if;
  update public.games set pending_guess_user_id = auth.uid(),
    pending_guess_code = country_code, updated_at = now(),
    last_event = jsonb_build_object('type', 'country_guessed',
      'player_name', guesser_name, 'country_code', country_code, 'at', now())
  where id = target_game_id;
end; $$;

create or replace function public.reject_country_guess(target_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.games set pending_guess_user_id = null, pending_guess_code = null,
    updated_at = now(), last_event = jsonb_build_object('type', 'guess_rejected', 'at', now())
  where id = target_game_id and status = 'active'
    and card_holder_user_id = auth.uid();
  if not found then raise exception 'Only the card holder can reject a guess'; end if;
end; $$;

create or replace function public.award_point(target_game_id uuid, guessed_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare current_game public.games; winner public.game_players; next_index integer;
  next_holder uuid; next_roller uuid; reward text;
begin
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now() for update;
  if current_game.id is null or current_game.card_holder_user_id <> auth.uid()
    then raise exception 'Only the card holder can award a card'; end if;
  if current_game.clue_roll is null then raise exception 'Wait for a die roll'; end if;
  reward := (array['flag', 'buzzword', 'continent', 'reroll'])[
    floor(random() * 4)::integer + 1
  ];
  update public.game_players set score = score + 1, bonus_tokens = bonus_tokens + 1,
    flag_tokens = flag_tokens + case when reward = 'flag' then 1 else 0 end,
    buzzword_tokens = buzzword_tokens + case when reward = 'buzzword' then 1 else 0 end,
    continent_tokens = continent_tokens + case when reward = 'continent' then 1 else 0 end,
    reroll_tokens = reroll_tokens + case when reward = 'reroll' then 1 else 0 end
  where game_id = target_game_id and user_id = guessed_user_id and user_id <> auth.uid()
  returning * into winner;
  if winner.id is null then raise exception 'Choose an eligible guesser'; end if;
  next_index := current_game.current_card_index + 1;
  select user_id into next_holder from public.game_players
    where game_id = target_game_id and joined_at >
      (select joined_at from public.game_players where game_id = target_game_id and user_id = auth.uid())
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
    bonus_type = null, bonus_user_id = null,
    pending_guess_user_id = null, pending_guess_code = null, updated_at = now(),
    last_event = jsonb_build_object('type', 'point_awarded',
      'player_name', winner.name::text, 'score', winner.score,
      'reward', reward, 'at', now())
  where id = target_game_id;
end; $$;

revoke execute on function public.submit_country_guess(uuid, text) from public;
revoke execute on function public.reject_country_guess(uuid) from public;
grant execute on function public.submit_country_guess(uuid, text) to authenticated;
grant execute on function public.reject_country_guess(uuid) to authenticated;

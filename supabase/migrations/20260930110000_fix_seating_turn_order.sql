create or replace function public.start_game(target_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare oldest uuid; first_roller uuid;
begin
  select user_id into oldest from public.game_players where game_id = target_game_id
  order by age desc, joined_at, id limit 1;
  first_roller := public.next_guesser(target_game_id, oldest, oldest);
  update public.games set status = 'active', card_holder_user_id = oldest,
    turn_user_id = first_roller, clue_roll = null, die_roll = null,
    updated_at = now(), last_event = jsonb_build_object('type', 'game_started', 'at', now())
  where id = target_game_id and host_user_id = auth.uid() and status = 'lobby'
    and expires_at > now()
    and (select count(*) from public.game_players where game_id = target_game_id) between 3 and 6
    and not exists (select 1 from public.game_players where game_id = target_game_id and age is null);
  if not found then raise exception 'Only the host can start a lobby with 3 to 6 players and ages'; end if;
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
  next_roller := public.next_guesser(target_game_id, next_holder, next_holder);
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

revoke execute on function public.start_game(uuid) from public;
revoke execute on function public.award_point(uuid, uuid) from public;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.award_point(uuid, uuid) to authenticated;

create or replace function public.use_bonus_token(target_game_id uuid, help_type text)
returns smallint language plpgsql security definer set search_path = public as $$
declare current_game public.games; roller_name text; rolled smallint;
begin
  if help_type not in ('flag', 'buzzword', 'continent', 'reroll')
    then raise exception 'Unknown bonus help'; end if;
  select * into current_game from public.games where id = target_game_id
    and status = 'active' and expires_at > now() for update;
  if current_game.id is null or current_game.turn_user_id <> auth.uid()
    then raise exception 'Only the current player can use a token'; end if;
  if auth.uid() = any(current_game.map_guess_user_ids)
    or current_game.pending_guess_user_id = auth.uid()
    then raise exception 'Help tokens are locked after submitting a map guess'; end if;
  if current_game.token_used_this_turn then raise exception 'Only one token per turn'; end if;
  if help_type = 'reroll' and current_game.clue_roll is null
    then raise exception 'Roll the die before using a re-roll token'; end if;
  if help_type = 'reroll' then rolled := floor(random() * 6 + 1)::smallint; end if;
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
    end > 0 returning name into roller_name;
  if roller_name is null then raise exception 'You do not have that token'; end if;
  update public.games set token_used_this_turn = true,
    bonus_type = help_type, bonus_user_id = auth.uid(),
    clue_roll = coalesce(rolled, clue_roll), die_roll = coalesce(rolled, die_roll),
    updated_at = now(), last_event = jsonb_build_object('type', 'bonus_used',
      'player_name', roller_name, 'help_type', help_type, 'at', now())
  where id = target_game_id;
  return coalesce(rolled, current_game.clue_roll);
end; $$;

revoke execute on function public.use_bonus_token(uuid, text) from public;
grant execute on function public.use_bonus_token(uuid, text) to authenticated;

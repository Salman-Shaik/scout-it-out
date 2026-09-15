create extension if not exists pgcrypto;
create extension if not exists citext;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  singleton_slot smallint default 1 unique check (singleton_slot = 1),
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
  host_user_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'finished')),
  win_target smallint check (win_target in (3, 5, 7, 10) or win_target is null),
  card_holder_user_id uuid not null,
  current_card_index integer not null default 0,
  die_roll smallint check (die_roll between 1 and 6),
  last_event jsonb not null default '{}'::jsonb,
  winner_user_ids uuid[] not null default '{}',
  expires_at timestamptz not null default now() + interval '45 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null,
  name citext not null check (length(trim(name::text)) between 1 and 30),
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  unique (game_id, user_id),
  unique (game_id, name)
);

create table public.game_secrets (
  game_id uuid primary key references public.games(id) on delete cascade,
  country_codes text[] not null check (cardinality(country_codes) = 195)
);

create index game_players_game_joined_idx
  on public.game_players (game_id, joined_at, id);

alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_secrets enable row level security;

create or replace function public.is_game_player(target_game_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.game_players
    where game_id = target_game_id and user_id = auth.uid()
  );
$$;

create policy "participants read their game"
on public.games for select to authenticated
using (public.is_game_player(id));

create policy "participants read players"
on public.game_players for select to authenticated
using (public.is_game_player(game_id));

create policy "holder reads current secret"
on public.game_secrets for select to authenticated
using (
  public.is_game_player(game_id)
  and exists (
    select 1 from public.games
    where id = game_id and card_holder_user_id = auth.uid()
  )
);

create or replace function public.remove_expired_game()
returns void language sql security definer set search_path = public
as $$ delete from public.games where expires_at <= now(); $$;

create or replace function public.game_availability()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare active_game public.games;
begin
  perform public.remove_expired_game();
  select * into active_game from public.games where singleton_slot = 1;
  if active_game.id is null then
    return jsonb_build_object('available', true, 'retry_after_seconds', 0);
  end if;
  return jsonb_build_object(
    'available', false,
    'retry_after_seconds', greatest(0, ceil(extract(epoch from active_game.expires_at - now())))
  );
end;
$$;

create or replace function public.create_game(
  player_name text,
  target_score smallint,
  shuffled_country_codes text[]
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  new_game public.games;
  new_player public.game_players;
  generated_code text;
  existing_game public.games;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_score is not null and target_score not in (3, 5, 7, 10) then
    raise exception 'Invalid win target';
  end if;
  if cardinality(shuffled_country_codes) <> 195 then
    raise exception 'The country deck must contain 195 cards';
  end if;
  if (
    select count(distinct deck.code)
    from unnest(shuffled_country_codes) as deck(code)
  ) <> 195 then raise exception 'The country deck has duplicate cards'; end if;
  perform public.remove_expired_game();
  select * into existing_game from public.games where singleton_slot = 1;
  if existing_game.id is not null then
    return jsonb_build_object(
      'available', false,
      'retry_after_seconds', greatest(0, ceil(extract(epoch from existing_game.expires_at - now())))
    );
  end if;
  generated_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
  insert into public.games (room_code, host_user_id, win_target, card_holder_user_id)
  values (generated_code, auth.uid(), target_score, auth.uid())
  returning * into new_game;
  insert into public.game_players (game_id, user_id, name)
  values (new_game.id, auth.uid(), trim(player_name)) returning * into new_player;
  insert into public.game_secrets (game_id, country_codes)
  values (new_game.id, shuffled_country_codes);
  return jsonb_build_object(
    'available', true, 'game_id', new_game.id,
    'room_code', new_game.room_code, 'player_id', new_player.id
  );
exception when unique_violation then
  select * into existing_game from public.games where singleton_slot = 1;
  return jsonb_build_object(
    'available', false,
    'retry_after_seconds', greatest(0, ceil(extract(epoch from existing_game.expires_at - now())))
  );
end;
$$;

create or replace function public.join_game(join_code text, player_name text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare target_game public.games; new_player public.game_players;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.remove_expired_game();
  select * into target_game from public.games
    where room_code = upper(trim(join_code)) and status = 'lobby';
  if target_game.id is null then raise exception 'Room not found or already started'; end if;
  if (select count(*) from public.game_players where game_id = target_game.id) >= 13 then
    raise exception 'Room is full';
  end if;
  insert into public.game_players (game_id, user_id, name)
  values (target_game.id, auth.uid(), trim(player_name)) returning * into new_player;
  return jsonb_build_object('game_id', target_game.id, 'player_id', new_player.id);
end;
$$;

create or replace function public.start_game(target_game_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.games set status = 'active', updated_at = now(),
    last_event = jsonb_build_object('type', 'game_started', 'at', now())
  where id = target_game_id and host_user_id = auth.uid() and status = 'lobby'
    and (select count(*) from public.game_players where game_id = target_game_id) >= 3;
  if not found then
    raise exception 'Only the host can start a lobby with at least 3 players';
  end if;
end;
$$;

create or replace function public.roll_die(target_game_id uuid)
returns smallint language plpgsql security definer set search_path = public
as $$
declare rolled smallint := floor(random() * 6 + 1); roller_name text;
begin
  select name::text into roller_name from public.game_players
    where game_id = target_game_id and user_id = auth.uid();
  if roller_name is null then raise exception 'Player not found'; end if;
  update public.games set die_roll = rolled, updated_at = now(),
    last_event = jsonb_build_object(
      'type', 'die_rolled', 'player_name', roller_name, 'roll', rolled, 'at', now()
    )
  where id = target_game_id and status = 'active'
    and card_holder_user_id <> auth.uid();
  if not found then raise exception 'The card holder cannot roll'; end if;
  return rolled;
end;
$$;

create or replace function public.award_point(
  target_game_id uuid,
  guessed_user_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  active_game public.games;
  scored_player public.game_players;
  next_holder uuid;
  next_index integer;
begin
  select * into active_game from public.games
    where id = target_game_id and status = 'active' and expires_at > now()
    for update;
  if active_game.id is null then raise exception 'Game is not active'; end if;
  if active_game.card_holder_user_id <> auth.uid() then
    raise exception 'Only the card holder can award a point';
  end if;
  update public.game_players set score = score + 1
    where game_id = target_game_id and user_id = guessed_user_id
      and user_id <> auth.uid()
    returning * into scored_player;
  if scored_player.id is null then raise exception 'Choose an eligible guesser'; end if;
  next_index := active_game.current_card_index + 1;
  select user_id into next_holder from (
    select user_id, row_number() over (order by joined_at, id) - 1 as turn
    from public.game_players where game_id = target_game_id
  ) ordered_players
  where turn = next_index % (
    select count(*) from public.game_players where game_id = target_game_id
  );

  update public.games set
    singleton_slot = case
      when (win_target is not null and scored_player.score >= win_target)
        or next_index >= 195 then null
      else 1
    end,
    current_card_index = next_index,
    card_holder_user_id = next_holder,
    status = case
      when (win_target is not null and scored_player.score >= win_target)
        or next_index >= 195 then 'finished'
      else 'active'
    end,
    winner_user_ids = case
      when win_target is not null and scored_player.score >= win_target
        then array[scored_player.user_id]
      when next_index >= 195 then (
        select array_agg(user_id) from public.game_players
        where game_id = target_game_id and score = (
          select max(score) from public.game_players where game_id = target_game_id
        )
      )
      else '{}'::uuid[]
    end,
    die_roll = null,
    updated_at = now(),
    last_event = jsonb_build_object(
      'type', 'point_awarded',
      'player_name', scored_player.name::text,
      'score', scored_player.score,
      'at', now()
    )
  where id = target_game_id;
end;
$$;

create or replace function public.finish_game(
  target_game_id uuid,
  abandon boolean default false
)
returns void language plpgsql security definer set search_path = public
as $$
declare leaders uuid[];
begin
  if not public.is_game_player(target_game_id) then raise exception 'Player not found'; end if;
  if not exists (
    select 1 from public.games
    where id = target_game_id and host_user_id = auth.uid()
      and status in ('lobby', 'active') and expires_at > now()
  ) then raise exception 'Only the host can close a shared game'; end if;
  if abandon then
    delete from public.games where id = target_game_id;
    return;
  end if;
  if (select win_target from public.games where id = target_game_id) is not null then
    raise exception 'Only an Endless game can be ended manually';
  end if;
  select array_agg(user_id) into leaders from public.game_players
  where game_id = target_game_id
    and score = (select max(score) from public.game_players where game_id = target_game_id);
  update public.games set status = 'finished', singleton_slot = null,
    winner_user_ids = leaders,
    updated_at = now(),
    last_event = jsonb_build_object('type', 'game_ended', 'at', now())
  where id = target_game_id;
end;
$$;

revoke all on public.games, public.game_players, public.game_secrets
  from anon, authenticated;
revoke execute on function public.is_game_player(uuid) from public;
revoke execute on function public.remove_expired_game() from public;
revoke execute on function public.create_game(text, smallint, text[]) from public;
revoke execute on function public.join_game(text, text) from public;
revoke execute on function public.start_game(uuid) from public;
revoke execute on function public.roll_die(uuid) from public;
revoke execute on function public.award_point(uuid, uuid) from public;
revoke execute on function public.finish_game(uuid, boolean) from public;
revoke execute on function public.game_availability() from public;
grant select on public.games, public.game_players, public.game_secrets
  to authenticated;
grant execute on function public.is_game_player(uuid) to authenticated;
grant execute on function public.game_availability() to anon, authenticated;
grant execute on function public.create_game(text, smallint, text[]) to authenticated;
grant execute on function public.join_game(text, text) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.roll_die(uuid) to authenticated;
grant execute on function public.award_point(uuid, uuid) to authenticated;
grant execute on function public.finish_game(uuid, boolean) to authenticated;

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;

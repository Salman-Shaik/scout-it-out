-- The room expiry is a stale-lock safeguard, not a timed game rule.
-- Each meaningful game action extends the lease; passive page polling does not.
create function public.extend_game_lease()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status in ('lobby', 'active')
    and new.updated_at is distinct from old.updated_at then
    new.expires_at := now() + interval '45 minutes';
  end if;
  return new;
end; $$;

create trigger extend_game_lease_on_action
before update on public.games
for each row execute function public.extend_game_lease();

create function public.touch_lobby_on_join()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.games set updated_at = now()
  where id = new.game_id and status = 'lobby';
  return new;
end; $$;

create trigger extend_game_lease_on_join
after insert on public.game_players
for each row execute function public.touch_lobby_on_join();

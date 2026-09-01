begin;

drop function if exists public.recover_player(text);
drop function if exists public.rotate_recovery_code();
drop function if exists public.get_player_identity();
drop function if exists public.create_player_identity(text, text);
drop function if exists private.recover_player(text);
drop function if exists private.consume_recovery_attempt(uuid);
drop function if exists private.get_player_identity();
drop function if exists private.create_player_identity(text, text);
drop function if exists private.issue_recovery_code(uuid);
drop function if exists private.format_recovery_code(text);
drop function if exists private.identity_payload(uuid);

drop table if exists private.retired_auth_users;
drop table if exists private.recovery_attempts;
drop table if exists private.player_recovery_credentials;

create or replace function private.ensure_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  if p_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select left(coalesce(
    nullif(raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(email, '@', 1), ''),
    'Joueur'
  ), 40)
  into v_display_name
  from auth.users
  where id = p_player_id;

  if v_display_name is null then
    raise exception 'Compte introuvable.' using errcode = '42501';
  end if;

  insert into public.players (id, display_name)
  values (p_player_id, v_display_name)
  on conflict (id) do nothing;

  perform private.ensure_market_listings(p_player_id, 10);
end;
$$;

alter table public.players drop constraint if exists players_identity_safe_characters;
alter table public.players drop constraint if exists players_player_name_length;
alter table public.players drop constraint if exists players_garage_name_length;
alter table public.players drop column if exists player_name;
alter table public.players drop column if exists garage_name;

revoke execute on function private.ensure_player(uuid) from public, anon, authenticated;

commit;

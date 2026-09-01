begin;

alter table public.players add column garage_name text;
alter table public.players add column player_name text;

update public.players
set garage_name = display_name,
    player_name = display_name
where garage_name is null or player_name is null;

alter table public.players alter column garage_name set not null;
alter table public.players alter column player_name set not null;
alter table public.players add constraint players_garage_name_length
  check (char_length(btrim(garage_name)) between 2 and 40);
alter table public.players add constraint players_player_name_length
  check (char_length(btrim(player_name)) between 2 and 30);
alter table public.players add constraint players_identity_safe_characters
  check (
    garage_name !~ '[[:cntrl:]<>]'
    and player_name !~ '[[:cntrl:]<>]'
  );

create table private.player_recovery_credentials (
  player_id uuid primary key references public.players(id) on delete cascade,
  code_hash bytea not null unique,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  rotated_at timestamptz not null default clock_timestamp(),
  recovered_at timestamptz
);

create table private.recovery_attempts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  window_started_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

create table private.retired_auth_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  recovered_to_auth_user_id uuid not null references auth.users(id) on delete restrict,
  retired_at timestamptz not null default clock_timestamp(),
  check (auth_user_id <> recovered_to_auth_user_id)
);

create index retired_auth_users_recovered_to_idx
  on private.retired_auth_users (recovered_to_auth_user_id);

revoke all on private.player_recovery_credentials from public, anon, authenticated;
revoke all on private.recovery_attempts from public, anon, authenticated;
revoke all on private.retired_auth_users from public, anon, authenticated;

create or replace function private.ensure_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_garage_name text;
  v_player_name text;
begin
  if p_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from private.retired_auth_users as retired
    where retired.auth_user_id = p_player_id
  ) then
    raise exception 'Cette session a été transférée vers un autre appareil.'
      using errcode = '42501';
  end if;

  select
    left(coalesce(
      nullif(btrim(raw_user_meta_data ->> 'garage_name'), ''),
      nullif(btrim(raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(email, '@', 1), ''),
      'Garage sans nom'
    ), 40),
    left(coalesce(
      nullif(btrim(raw_user_meta_data ->> 'player_name'), ''),
      nullif(btrim(raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(email, '@', 1), ''),
      'Joueur'
    ), 30)
  into v_garage_name, v_player_name
  from auth.users
  where id = p_player_id;

  if v_garage_name is null or v_player_name is null then
    raise exception 'Compte introuvable.' using errcode = '42501';
  end if;

  insert into public.players (id, display_name, garage_name, player_name)
  values (p_player_id, v_garage_name, v_garage_name, v_player_name)
  on conflict (id) do nothing;

  perform private.ensure_market_listings(p_player_id, 10);
end;
$$;

create or replace function private.identity_payload(p_player_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'garageName', player.garage_name,
    'playerName', player.player_name
  )
  from public.players as player
  where player.id = p_player_id;
$$;

create or replace function private.format_recovery_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'GG-'
    || substring(p_code from 1 for 4) || '-'
    || substring(p_code from 5 for 4) || '-'
    || substring(p_code from 9 for 4) || '-'
    || substring(p_code from 13 for 4) || '-'
    || substring(p_code from 17 for 4) || '-'
    || substring(p_code from 21 for 4) || '-'
    || substring(p_code from 25 for 4) || '-'
    || substring(p_code from 29 for 4);
$$;

create or replace function private.issue_recovery_code(p_player_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if p_player_id is null or p_player_id <> (select auth.uid()) then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Compte joueur introuvable.' using errcode = '42501';
  end if;

  v_code := upper(encode(gen_random_bytes(16), 'hex'));

  insert into private.player_recovery_credentials (
    player_id,
    code_hash,
    version,
    created_at,
    rotated_at
  ) values (
    p_player_id,
    digest(v_code, 'sha256'),
    1,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (player_id) do update
  set code_hash = excluded.code_hash,
      version = private.player_recovery_credentials.version + 1,
      rotated_at = clock_timestamp();

  return private.format_recovery_code(v_code);
end;
$$;

create or replace function private.create_player_identity(
  p_garage_name text,
  p_player_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := (select auth.uid());
  v_garage_name text := regexp_replace(btrim(coalesce(p_garage_name, '')), '[[:space:]]+', ' ', 'g');
  v_player_name text := regexp_replace(btrim(coalesce(p_player_name, '')), '[[:space:]]+', ' ', 'g');
  v_code text;
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if char_length(v_garage_name) not between 2 and 40
    or v_garage_name ~ '[[:cntrl:]<>]' then
    raise exception 'Le nom du garage doit contenir entre 2 et 40 caractères.'
      using errcode = '22023';
  end if;
  if char_length(v_player_name) not between 2 and 30
    or v_player_name ~ '[[:cntrl:]<>]' then
    raise exception 'Le pseudo doit contenir entre 2 et 30 caractères.'
      using errcode = '22023';
  end if;

  perform private.ensure_player(v_player_id);
  update public.players
  set display_name = v_garage_name,
      garage_name = v_garage_name,
      player_name = v_player_name
  where id = v_player_id;

  v_code := private.issue_recovery_code(v_player_id);
  return private.identity_payload(v_player_id)
    || jsonb_build_object('recoveryCode', v_code);
end;
$$;

create or replace function private.get_player_identity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := (select auth.uid());
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  perform private.ensure_player(v_player_id);
  return private.identity_payload(v_player_id);
end;
$$;

create or replace function private.consume_recovery_attempt(p_auth_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt private.recovery_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  insert into private.recovery_attempts (auth_user_id)
  values (p_auth_user_id)
  on conflict (auth_user_id) do nothing;

  select * into v_attempt
  from private.recovery_attempts
  where auth_user_id = p_auth_user_id
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > v_now then
    update private.recovery_attempts
    set updated_at = v_now
    where auth_user_id = p_auth_user_id;
    return false;
  end if;

  if v_attempt.window_started_at < v_now - interval '15 minutes' then
    update private.recovery_attempts
    set attempt_count = 1,
        window_started_at = v_now,
        locked_until = null,
        updated_at = v_now
    where auth_user_id = p_auth_user_id;
    return true;
  end if;

  if v_attempt.attempt_count >= 5 then
    update private.recovery_attempts
    set attempt_count = 5,
        locked_until = v_now + interval '15 minutes',
        updated_at = v_now
    where auth_user_id = p_auth_user_id;
    return false;
  end if;

  update private.recovery_attempts
  set attempt_count = attempt_count + 1,
      updated_at = v_now
  where auth_user_id = p_auth_user_id;
  return true;
end;
$$;

create or replace function private.recover_player(p_recovery_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_player_id uuid := (select auth.uid());
  v_source_player_id uuid;
  v_normalized_code text := regexp_replace(upper(coalesce(p_recovery_code, '')), '[^0-9A-F]', '', 'g');
  v_new_code text;
begin
  if v_current_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if not private.consume_recovery_attempt(v_current_player_id) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Trop de tentatives. Réessaie dans 15 minutes.'
    );
  end if;

  if char_length(v_normalized_code) = 32 then
    select credential.player_id
    into v_source_player_id
    from private.player_recovery_credentials as credential
    where credential.code_hash = digest(v_normalized_code, 'sha256')
    for update;
  end if;

  if v_source_player_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Code inconnu ou expiré. Vérifie chaque groupe puis réessaie.'
    );
  end if;

  perform private.ensure_player(v_current_player_id);

  if v_source_player_id <> v_current_player_id then
    delete from public.players where id = v_current_player_id;

    insert into public.players (
      id,
      display_name,
      cash,
      profit_today,
      profit_day_key,
      garage_public,
      created_at,
      updated_at,
      garage_name,
      player_name
    )
    select
      v_current_player_id,
      source.display_name,
      source.cash,
      source.profit_today,
      source.profit_day_key,
      source.garage_public,
      source.created_at,
      source.updated_at,
      source.garage_name,
      source.player_name
    from public.players as source
    where source.id = v_source_player_id;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'error', 'Cette sauvegarde n’est plus disponible.'
      );
    end if;

    update public.market_listings set player_id = v_current_player_id
    where player_id = v_source_player_id;
    update public.owned_vehicles set player_id = v_current_player_id
    where player_id = v_source_player_id;
    update public.owned_properties set player_id = v_current_player_id
    where player_id = v_source_player_id;
    update public.transactions set player_id = v_current_player_id
    where player_id = v_source_player_id;
    update public.game_events set player_id = v_current_player_id
    where player_id = v_source_player_id;
    update public.notifications set player_id = v_current_player_id
    where player_id = v_source_player_id;
    update private.action_receipts set player_id = v_current_player_id
    where player_id = v_source_player_id;
    update private.player_recovery_credentials
    set player_id = v_current_player_id,
        recovered_at = clock_timestamp()
    where player_id = v_source_player_id;

    insert into private.retired_auth_users (
      auth_user_id,
      recovered_to_auth_user_id
    ) values (
      v_source_player_id,
      v_current_player_id
    )
    on conflict (auth_user_id) do update
    set recovered_to_auth_user_id = excluded.recovered_to_auth_user_id,
        retired_at = clock_timestamp();

    delete from public.players where id = v_source_player_id;
  end if;

  delete from private.recovery_attempts
  where auth_user_id = v_current_player_id;

  v_new_code := private.issue_recovery_code(v_current_player_id);
  return jsonb_build_object('ok', true)
    || private.identity_payload(v_current_player_id)
    || jsonb_build_object('recoveryCode', v_new_code);
end;
$$;

create or replace function public.create_player_identity(
  p_garage_name text,
  p_player_name text
)
returns jsonb
language sql
set search_path = ''
as $$
  select private.create_player_identity(p_garage_name, p_player_name);
$$;

create or replace function public.get_player_identity()
returns jsonb
language sql
set search_path = ''
as $$
  select private.get_player_identity();
$$;

create or replace function public.rotate_recovery_code()
returns text
language sql
set search_path = ''
as $$
  select private.issue_recovery_code((select auth.uid()));
$$;

create or replace function public.recover_player(p_recovery_code text)
returns jsonb
language sql
set search_path = ''
as $$
  select private.recover_player(p_recovery_code);
$$;

revoke execute on function private.identity_payload(uuid) from public, anon, authenticated;
revoke execute on function private.format_recovery_code(text) from public, anon, authenticated;
revoke execute on function private.issue_recovery_code(uuid) from public, anon, authenticated;
revoke execute on function private.create_player_identity(text, text) from public, anon, authenticated;
revoke execute on function private.get_player_identity() from public, anon, authenticated;
revoke execute on function private.consume_recovery_attempt(uuid) from public, anon, authenticated;
revoke execute on function private.recover_player(text) from public, anon, authenticated;

revoke execute on function public.create_player_identity(text, text) from public, anon;
revoke execute on function public.get_player_identity() from public, anon;
revoke execute on function public.rotate_recovery_code() from public, anon;
revoke execute on function public.recover_player(text) from public, anon;

grant execute on function private.create_player_identity(text, text) to authenticated;
grant execute on function private.get_player_identity() to authenticated;
grant execute on function private.issue_recovery_code(uuid) to authenticated;
grant execute on function private.recover_player(text) to authenticated;
grant execute on function public.create_player_identity(text, text) to authenticated;
grant execute on function public.get_player_identity() to authenticated;
grant execute on function public.rotate_recovery_code() to authenticated;
grant execute on function public.recover_player(text) to authenticated;

comment on table private.player_recovery_credentials is
  'Le code de récupération n’est conservé que sous forme SHA-256. Les 128 bits aléatoires rendent une attaque hors ligne impraticable.';
comment on function public.rotate_recovery_code() is
  'Émet un nouveau code en clair une seule fois et invalide immédiatement le précédent.';
comment on function public.recover_player(text) is
  'Transfère atomiquement la partie vers la session anonyme courante, retire l’ancien identifiant et renouvelle le code.';

commit;

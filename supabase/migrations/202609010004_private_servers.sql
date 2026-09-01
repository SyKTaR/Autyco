begin;

create table public.private_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint private_servers_name_length
    check (char_length(btrim(name)) between 2 and 40),
  constraint private_servers_name_safe_characters
    check (name !~ '[[:cntrl:]<>]')
);

create index private_servers_owner_idx on public.private_servers (owner_player_id);

create table public.private_server_memberships (
  player_id uuid primary key references public.players(id) on delete cascade,
  server_id uuid not null references public.private_servers(id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp()
);

create index private_server_memberships_server_joined_idx
  on public.private_server_memberships (server_id, joined_at, player_id);

create table private.private_server_invites (
  server_id uuid primary key references public.private_servers(id) on delete cascade,
  code_hash bytea not null unique,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  rotated_at timestamptz not null default clock_timestamp()
);

create table private.private_server_join_attempts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  window_started_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

revoke all on private.private_server_invites from public, anon, authenticated;
revoke all on private.private_server_join_attempts from public, anon, authenticated;

create trigger private_servers_set_updated_at
before update on public.private_servers
for each row execute function private.set_updated_at();

create or replace function private.can_read_private_server(p_server_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.private_server_memberships as membership
      where membership.server_id = p_server_id
        and membership.player_id = (select auth.uid())
    );
$$;

create or replace function private.format_private_server_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'SRV-'
    || substring(p_code from 1 for 4) || '-'
    || substring(p_code from 5 for 4) || '-'
    || substring(p_code from 9 for 4) || '-'
    || substring(p_code from 13 for 4) || '-'
    || substring(p_code from 17 for 4) || '-'
    || substring(p_code from 21 for 4) || '-'
    || substring(p_code from 25 for 4) || '-'
    || substring(p_code from 29 for 4);
$$;

create or replace function private.private_server_payload(p_server_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'id', server.id::text,
    'name', server.name,
    'memberCount', (
      select count(*)::integer
      from public.private_server_memberships as member_count
      where member_count.server_id = server.id
    ),
    'createdAt', (extract(epoch from server.created_at) * 1000)::bigint,
    'isOwner', server.owner_player_id = (select auth.uid())
  )
  from public.private_servers as server
  where server.id = p_server_id;
$$;

create or replace function private.issue_private_server_invite(
  p_server_id uuid,
  p_player_id uuid
)
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

  if not exists (
    select 1
    from public.private_server_memberships as membership
    where membership.server_id = p_server_id
      and membership.player_id = p_player_id
  ) then
    raise exception 'Tu ne fais pas partie de ce serveur.' using errcode = '42501';
  end if;

  v_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));

  insert into private.private_server_invites (
    server_id,
    code_hash,
    version,
    created_at,
    rotated_at
  ) values (
    p_server_id,
    extensions.digest(v_code, 'sha256'),
    1,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (server_id) do update
  set code_hash = excluded.code_hash,
      version = private.private_server_invites.version + 1,
      rotated_at = clock_timestamp();

  return private.format_private_server_code(v_code);
end;
$$;

create or replace function private.consume_private_server_join_attempt(p_auth_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt private.private_server_join_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  insert into private.private_server_join_attempts (auth_user_id)
  values (p_auth_user_id)
  on conflict (auth_user_id) do nothing;

  select * into v_attempt
  from private.private_server_join_attempts
  where auth_user_id = p_auth_user_id
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > v_now then
    update private.private_server_join_attempts
    set updated_at = v_now
    where auth_user_id = p_auth_user_id;
    return false;
  end if;

  if v_attempt.window_started_at < v_now - interval '15 minutes' then
    update private.private_server_join_attempts
    set attempt_count = 1,
        window_started_at = v_now,
        locked_until = null,
        updated_at = v_now
    where auth_user_id = p_auth_user_id;
    return true;
  end if;

  if v_attempt.attempt_count >= 5 then
    update private.private_server_join_attempts
    set attempt_count = 5,
        locked_until = v_now + interval '15 minutes',
        updated_at = v_now
    where auth_user_id = p_auth_user_id;
    return false;
  end if;

  update private.private_server_join_attempts
  set attempt_count = attempt_count + 1,
      updated_at = v_now
  where auth_user_id = p_auth_user_id;
  return true;
end;
$$;

-- Un serveur privé n'est jamais supprimé automatiquement lorsqu'il devient vide : il reste
-- créé jusqu'à ce que son créateur le ferme explicitement via private.close_private_server().
-- Cette fonction a existé un temps pour une suppression automatique ; elle est conservée en
-- commentaire pour mémoire mais n'est plus appelée nulle part dans cette migration.

create or replace function private.close_private_server(p_server_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := (select auth.uid());
  v_owner_id uuid;
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select server.owner_player_id
  into v_owner_id
  from public.private_servers as server
  where server.id = p_server_id
  for update;

  if v_owner_id is null then
    raise exception 'Ce serveur n’existe plus.' using errcode = '22023';
  end if;

  if v_owner_id <> v_player_id then
    raise exception 'Seul le créateur peut fermer ce serveur.' using errcode = '42501';
  end if;

  delete from public.private_servers where id = p_server_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function private.create_private_server(
  p_name text,
  p_replace_current boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := (select auth.uid());
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_previous_server_id uuid;
  v_server_id uuid;
  v_code text;
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 2 and 40 or v_name ~ '[[:cntrl:]<>]' then
    raise exception 'Le nom du serveur doit contenir entre 2 et 40 caractères.'
      using errcode = '22023';
  end if;

  perform private.ensure_player(v_player_id);
  perform 1 from public.players where id = v_player_id for update;

  select membership.server_id
  into v_previous_server_id
  from public.private_server_memberships as membership
  where membership.player_id = v_player_id;

  if v_previous_server_id is not null and not p_replace_current then
    return jsonb_build_object(
      'ok', false,
      'requiresConfirmation', true,
      'error', 'Créer ce serveur remplacera ta dépendance actuelle.'
    );
  end if;

  if v_previous_server_id is not null then
    delete from public.private_server_memberships where player_id = v_player_id;
  end if;

  insert into public.private_servers (name, owner_player_id)
  values (v_name, v_player_id)
  returning id into v_server_id;

  insert into public.private_server_memberships (player_id, server_id)
  values (v_player_id, v_server_id);

  v_code := private.issue_private_server_invite(v_server_id, v_player_id);

  return jsonb_build_object(
    'ok', true,
    'server', private.private_server_payload(v_server_id),
    'inviteCode', v_code
  );
end;
$$;

create or replace function private.get_current_private_server()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_player_id uuid := (select auth.uid());
  v_server_id uuid;
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select membership.server_id
  into v_server_id
  from public.private_server_memberships as membership
  where membership.player_id = v_player_id;

  return jsonb_build_object(
    'server', case
      when v_server_id is null then null
      else private.private_server_payload(v_server_id)
    end
  );
end;
$$;

create or replace function private.rotate_private_server_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := (select auth.uid());
  v_server_id uuid;
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select membership.server_id
  into v_server_id
  from public.private_server_memberships as membership
  where membership.player_id = v_player_id;

  if v_server_id is null then
    raise exception 'Tu ne fais partie d’aucun serveur.' using errcode = '22023';
  end if;

  return private.issue_private_server_invite(v_server_id, v_player_id);
end;
$$;

create or replace function private.join_private_server(
  p_invite_code text,
  p_replace_current boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := (select auth.uid());
  v_normalized_code text := regexp_replace(
    upper(coalesce(p_invite_code, '')),
    '[^0-9A-F]',
    '',
    'g'
  );
  v_server_id uuid;
  v_previous_server_id uuid;
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if not private.consume_private_server_join_attempt(v_player_id) then
    return jsonb_build_object(
      'ok', false,
      'rateLimited', true,
      'error', 'Trop de tentatives. Réessaie dans 15 minutes.'
    );
  end if;

  if char_length(v_normalized_code) = 32 then
    select invite.server_id
    into v_server_id
    from private.private_server_invites as invite
    where invite.code_hash = extensions.digest(v_normalized_code, 'sha256')
    for update;
  end if;

  if v_server_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Code inconnu ou expiré. Vérifie chaque groupe puis réessaie.'
    );
  end if;

  delete from private.private_server_join_attempts
  where auth_user_id = v_player_id;

  perform private.ensure_player(v_player_id);
  perform 1 from public.players where id = v_player_id for update;

  select membership.server_id
  into v_previous_server_id
  from public.private_server_memberships as membership
  where membership.player_id = v_player_id;

  if v_previous_server_id = v_server_id then
    return jsonb_build_object(
      'ok', true,
      'server', private.private_server_payload(v_server_id)
    );
  end if;

  if v_previous_server_id is not null and not p_replace_current then
    return jsonb_build_object(
      'ok', false,
      'requiresConfirmation', true,
      'error', 'Rejoindre ce serveur remplacera ta dépendance actuelle.'
    );
  end if;

  if v_previous_server_id is not null then
    delete from public.private_server_memberships where player_id = v_player_id;
  end if;

  insert into public.private_server_memberships (player_id, server_id)
  values (v_player_id, v_server_id);

  return jsonb_build_object(
    'ok', true,
    'server', private.private_server_payload(v_server_id)
  );
end;
$$;

-- Quitter un serveur ne le supprime jamais, y compris pour le dernier membre restant : seul le
-- créateur peut le fermer, via private.close_private_server(). Un créateur qui quitte son propre
-- serveur (sans le fermer) reste donc "propriétaire absent" ; il peut le refermer plus tard ou le
-- rejoindre à nouveau avec le code.
create or replace function private.leave_private_server()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := (select auth.uid());
  v_server_id uuid;
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  perform 1 from public.players where id = v_player_id for update;

  delete from public.private_server_memberships
  where player_id = v_player_id
  returning server_id into v_server_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function private.get_private_server_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_player_id uuid := (select auth.uid());
  v_server_id uuid;
  v_members jsonb;
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select membership.server_id
  into v_server_id
  from public.private_server_memberships as membership
  where membership.player_id = v_player_id;

  if v_server_id is null then
    raise exception 'Tu ne fais partie d’aucun serveur.' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', ranked.rank,
        'playerId', ranked.player_id::text,
        'playerName', ranked.player_name,
        'garageName', ranked.garage_name,
        'cash', ranked.cash,
        'fleetValue', ranked.fleet_value,
        'totalValue', ranked.total_value,
        'vehicleCount', ranked.vehicle_count,
        'isCurrentPlayer', ranked.player_id = v_player_id
      ) order by ranked.rank
    ),
    '[]'::jsonb
  )
  into v_members
  from (
    select
      member_values.*,
      row_number() over (
        order by member_values.total_value desc,
          member_values.cash desc,
          member_values.joined_at,
          member_values.player_id
      )::integer as rank
    from (
      select
        player.id as player_id,
        player.player_name,
        player.garage_name,
        player.cash,
        membership.joined_at,
        coalesce((
          select sum(private.vehicle_resale_value(vehicle.id))::bigint
          from public.owned_vehicles as vehicle
          where vehicle.player_id = player.id
            and vehicle.sold_at is null
        ), 0::bigint) as fleet_value,
        player.cash + coalesce((
          select sum(private.vehicle_resale_value(vehicle.id))::bigint
          from public.owned_vehicles as vehicle
          where vehicle.player_id = player.id
            and vehicle.sold_at is null
        ), 0::bigint) as total_value,
        (
          select count(*)::integer
          from public.owned_vehicles as vehicle
          where vehicle.player_id = player.id
            and vehicle.sold_at is null
        ) as vehicle_count
      from public.private_server_memberships as membership
      join public.players as player on player.id = membership.player_id
      where membership.server_id = v_server_id
    ) as member_values
  ) as ranked;

  return jsonb_build_object(
    'server', private.private_server_payload(v_server_id),
    'members', v_members
  );
end;
$$;

create or replace function private.transfer_private_server_membership_on_player_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovered_to uuid;
  v_server_id uuid;
begin
  select membership.server_id
  into v_server_id
  from public.private_server_memberships as membership
  where membership.player_id = old.id;

  select retired.recovered_to_auth_user_id
  into v_recovered_to
  from private.retired_auth_users as retired
  where retired.auth_user_id = old.id;

  if v_recovered_to is not null then
    -- Transfère aussi la propriété d'un serveur créé par l'ancienne identité avant que la
    -- suppression de sa ligne `players` ne cascade sur `private_servers.owner_player_id`.
    update public.private_servers
    set owner_player_id = v_recovered_to
    where owner_player_id = old.id;
    update public.private_server_memberships
    set player_id = v_recovered_to
    where player_id = old.id;
  end if;

  return old;
end;
$$;

create trigger players_transfer_private_server_membership
before delete on public.players
for each row execute function private.transfer_private_server_membership_on_player_delete();

alter table public.private_servers enable row level security;
alter table public.private_server_memberships enable row level security;

create policy private_servers_select_member on public.private_servers
for select to authenticated
using (private.can_read_private_server(id));

create policy private_server_memberships_select_common_server
on public.private_server_memberships
for select to authenticated
using (private.can_read_private_server(server_id));

revoke all on public.private_servers, public.private_server_memberships
  from anon, authenticated;
grant select on public.private_servers, public.private_server_memberships
  to authenticated;

create or replace function public.create_private_server(
  p_name text,
  p_replace_current boolean default false
)
returns jsonb
language sql
set search_path = ''
as $$
  select private.create_private_server(p_name, p_replace_current);
$$;

create or replace function public.get_current_private_server()
returns jsonb
language sql
set search_path = ''
stable
as $$
  select private.get_current_private_server();
$$;

create or replace function public.rotate_private_server_invite()
returns text
language sql
set search_path = ''
as $$
  select private.rotate_private_server_invite();
$$;

create or replace function public.join_private_server(
  p_invite_code text,
  p_replace_current boolean default false
)
returns jsonb
language sql
set search_path = ''
as $$
  select private.join_private_server(p_invite_code, p_replace_current);
$$;

create or replace function public.leave_private_server()
returns jsonb
language sql
set search_path = ''
as $$
  select private.leave_private_server();
$$;

create or replace function public.close_private_server(p_server_id uuid)
returns jsonb
language sql
set search_path = ''
as $$
  select private.close_private_server(p_server_id);
$$;

create or replace function public.get_private_server_leaderboard()
returns jsonb
language sql
set search_path = ''
stable
as $$
  select private.get_private_server_leaderboard();
$$;

revoke execute on function private.can_read_private_server(uuid)
  from public, anon, authenticated;
revoke execute on function private.format_private_server_code(text)
  from public, anon, authenticated;
revoke execute on function private.private_server_payload(uuid)
  from public, anon, authenticated;
revoke execute on function private.issue_private_server_invite(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.consume_private_server_join_attempt(uuid)
  from public, anon, authenticated;
revoke execute on function private.close_private_server(uuid)
  from public, anon, authenticated;
revoke execute on function private.create_private_server(text, boolean)
  from public, anon, authenticated;
revoke execute on function private.get_current_private_server()
  from public, anon, authenticated;
revoke execute on function private.rotate_private_server_invite()
  from public, anon, authenticated;
revoke execute on function private.join_private_server(text, boolean)
  from public, anon, authenticated;
revoke execute on function private.leave_private_server()
  from public, anon, authenticated;
revoke execute on function private.get_private_server_leaderboard()
  from public, anon, authenticated;
revoke execute on function private.transfer_private_server_membership_on_player_delete()
  from public, anon, authenticated;

revoke execute on function public.create_private_server(text, boolean) from public, anon;
revoke execute on function public.get_current_private_server() from public, anon;
revoke execute on function public.rotate_private_server_invite() from public, anon;
revoke execute on function public.join_private_server(text, boolean) from public, anon;
revoke execute on function public.leave_private_server() from public, anon;
revoke execute on function public.close_private_server(uuid) from public, anon;
revoke execute on function public.get_private_server_leaderboard() from public, anon;

grant execute on function private.can_read_private_server(uuid) to authenticated;
grant execute on function private.create_private_server(text, boolean) to authenticated;
grant execute on function private.get_current_private_server() to authenticated;
grant execute on function private.rotate_private_server_invite() to authenticated;
grant execute on function private.join_private_server(text, boolean) to authenticated;
grant execute on function private.leave_private_server() to authenticated;
grant execute on function private.close_private_server(uuid) to authenticated;
grant execute on function private.get_private_server_leaderboard() to authenticated;

grant execute on function public.create_private_server(text, boolean) to authenticated;
grant execute on function public.get_current_private_server() to authenticated;
grant execute on function public.rotate_private_server_invite() to authenticated;
grant execute on function public.join_private_server(text, boolean) to authenticated;
grant execute on function public.leave_private_server() to authenticated;
grant execute on function public.close_private_server(uuid) to authenticated;
grant execute on function public.get_private_server_leaderboard() to authenticated;

comment on table public.private_servers is
  'Groupes privés non découvrables. La lecture directe est limitée aux membres par RLS. '
  'Un serveur n’est jamais supprimé automatiquement en devenant vide : seul owner_player_id '
  'peut le fermer via close_private_server().';
comment on table public.private_server_memberships is
  'Une ligne par joueur impose un seul serveur actif. La lecture RLS exige un serveur commun.';
comment on table private.private_server_invites is
  'Le code d’invitation de 128 bits est conservé uniquement sous forme SHA-256.';
comment on function public.get_private_server_leaderboard() is
  'Projection en lecture seule des membres du serveur courant. Les tables économiques restent self-only.';
comment on function public.rotate_private_server_invite() is
  'Émet un nouveau code en clair une seule fois et invalide immédiatement le précédent.';

commit;

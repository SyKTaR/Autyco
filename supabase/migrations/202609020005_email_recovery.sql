begin;

create table private.email_auth_attempts (
  identifier_hash bytea not null,
  action text not null check (action in ('send', 'verify')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  window_started_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (identifier_hash, action)
);

create index email_auth_attempts_updated_at_idx
  on private.email_auth_attempts (updated_at);

revoke all on private.email_auth_attempts from public, anon, authenticated;

create or replace function private.get_existing_player_identity()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_player_id uuid := (select auth.uid());
begin
  if v_player_id is null
    or not exists (select 1 from public.players where id = v_player_id)
    or exists (
      select 1
      from private.retired_auth_users
      where auth_user_id = v_player_id
    ) then
    raise exception 'Compte joueur introuvable.' using errcode = '42501';
  end if;

  return private.identity_payload(v_player_id);
end;
$$;

create or replace function private.consume_email_auth_attempt(
  p_email text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_identifier_hash bytea;
  v_attempt private.email_auth_attempts%rowtype;
  v_max_attempts smallint;
  v_now timestamptz := clock_timestamp();
begin
  if char_length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'error', 'Adresse email invalide.');
  end if;

  if v_action not in ('send', 'verify') then
    raise exception 'Action email invalide.' using errcode = '22023';
  end if;

  v_max_attempts := case when v_action = 'send' then 3 else 5 end;
  v_identifier_hash := extensions.digest(v_email, 'sha256');

  delete from private.email_auth_attempts
  where updated_at < v_now - interval '24 hours';

  insert into private.email_auth_attempts (identifier_hash, action)
  values (v_identifier_hash, v_action)
  on conflict (identifier_hash, action) do nothing;

  select * into v_attempt
  from private.email_auth_attempts
  where identifier_hash = v_identifier_hash and action = v_action
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > v_now then
    update private.email_auth_attempts
    set updated_at = v_now
    where identifier_hash = v_identifier_hash and action = v_action;
    return jsonb_build_object('ok', false, 'rateLimited', true);
  end if;

  if v_attempt.window_started_at < v_now - interval '15 minutes' then
    update private.email_auth_attempts
    set attempt_count = 1,
        window_started_at = v_now,
        locked_until = null,
        updated_at = v_now
    where identifier_hash = v_identifier_hash and action = v_action;
    return jsonb_build_object('ok', true);
  end if;

  if v_attempt.attempt_count >= v_max_attempts then
    update private.email_auth_attempts
    set attempt_count = v_max_attempts,
        locked_until = v_now + interval '15 minutes',
        updated_at = v_now
    where identifier_hash = v_identifier_hash and action = v_action;
    return jsonb_build_object('ok', false, 'rateLimited', true);
  end if;

  update private.email_auth_attempts
  set attempt_count = attempt_count + 1,
      updated_at = v_now
  where identifier_hash = v_identifier_hash and action = v_action;

  return jsonb_build_object('ok', true);
end;
$$;

-- Ce point d'entrée doit fonctionner avant authentification. Il est SECURITY DEFINER pour
-- atteindre uniquement la primitive privée, le schéma private restant inaccessible à anon.
create or replace function public.reserve_email_auth_attempt(
  p_email text,
  p_action text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.consume_email_auth_attempt(p_email, p_action);
$$;

create or replace function public.get_existing_player_identity()
returns jsonb
language sql
set search_path = ''
stable
as $$
  select private.get_existing_player_identity();
$$;

revoke execute on function private.get_existing_player_identity()
  from public, anon, authenticated;
revoke execute on function private.consume_email_auth_attempt(text, text)
  from public, anon, authenticated;
revoke execute on function public.reserve_email_auth_attempt(text, text)
  from public;
revoke execute on function public.get_existing_player_identity()
  from public, anon;

grant execute on function private.get_existing_player_identity()
  to authenticated;
grant execute on function public.reserve_email_auth_attempt(text, text)
  to anon, authenticated;
grant execute on function public.get_existing_player_identity()
  to authenticated;

comment on table private.email_auth_attempts is
  'Quotas applicatifs email par empreinte SHA-256 normalisée. Aucune adresse email en clair n’est stockée ici.';
comment on function public.reserve_email_auth_attempt(text, text) is
  'Réserve une tentative avant un envoi ou une vérification Auth email, sans indiquer si le compte existe.';
comment on function public.get_existing_player_identity() is
  'Retourne uniquement une identité joueur déjà existante après une connexion email, sans créer de garage.';

commit;

begin;

-- Garantit que pgcrypto est installée (idempotent, ne déplace pas une installation existante).
create extension if not exists pgcrypto with schema extensions;

-- Correctif : private.issue_recovery_code appelait gen_random_bytes()/digest() sans les
-- qualifier avec leur schéma. Avec search_path = '' (voulu pour la sécurité), Postgres ne les
-- trouvait pas : "function gen_random_bytes(integer) does not exist".
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

  v_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));

  insert into private.player_recovery_credentials (
    player_id,
    code_hash,
    version,
    created_at,
    rotated_at
  ) values (
    p_player_id,
    extensions.digest(v_code, 'sha256'),
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

-- Même correctif pour l'appel digest() dans la vérification du code de récupération.
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
    where credential.code_hash = extensions.digest(v_normalized_code, 'sha256')
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

commit;

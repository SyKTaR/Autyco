begin;

do $$
begin
  if exists (
    select 1
    from public.owned_vehicles
    where template_id in ('m3-e46', '911-996-carrera', 'alpine-a110', 'ferrari-360-modena')
  ) then
    raise exception 'Rollback refusé : un véhicule Rare/Collection existe dans l’historique joueur.';
  end if;
end;
$$;

-- Les annonces sont éphémères : repartir de zéro garantit le retour au quota unique de dix.
delete from public.market_listings;

delete from private.vehicle_templates
where id in ('m3-e46', '911-996-carrera', 'alpine-a110', 'ferrari-360-modena');

create or replace function private.ensure_market_listings(
  p_player_id uuid,
  p_target integer default 10
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing integer;
  v_template private.vehicle_templates%rowtype;
  v_risk text;
  v_year integer;
  v_market_value bigint;
  v_asking_price bigint;
  v_mileage integer;
  v_factor numeric;
  v_now timestamptz := clock_timestamp();
begin
  delete from public.market_listings
  where player_id = p_player_id and expires_at <= v_now;

  select greatest(0, p_target - count(*))::integer
  into v_missing
  from public.market_listings
  where player_id = p_player_id;

  for v_template in
    select template.*
    from private.vehicle_templates as template
    where not exists (
      select 1
      from public.market_listings as listing
      where listing.player_id = p_player_id
        and listing.template_id = template.id
    )
    order by random()
    limit v_missing
  loop
    v_factor := random();
    v_risk := case
      when v_factor < 0.36 then 'low'
      when v_factor < 0.76 then 'medium'
      else 'high'
    end;
    v_year := floor(v_template.year_min + random() * (v_template.year_max - v_template.year_min + 1));
    v_market_value := round((
      v_template.market_value
      * (1 + (v_year - (v_template.year_min + v_template.year_max) / 2.0) * 0.035)
      * (0.97 + random() * 0.07)
    ) / 100.0) * 100;
    v_factor := case v_risk
      when 'low' then 0.82 + random() * 0.08
      when 'medium' then 0.74 + random() * 0.10
      else 0.64 + random() * 0.13
    end;
    v_asking_price := greatest(1000, round((v_market_value * v_factor) / 100.0) * 100);
    v_mileage := round((v_template.mileage_min + random()
      * (v_template.mileage_max - v_template.mileage_min)) / 500.0) * 500;

    insert into public.market_listings (
      player_id, template_id, maker, model, segment, year, mileage,
      asking_price, market_value, risk, condition_hint, expires_at
    ) values (
      p_player_id, v_template.id, v_template.maker, v_template.model,
      v_template.segment, v_year, v_mileage, v_asking_price, v_market_value,
      v_risk,
      case v_risk
        when 'low' then 'Semble soignée'
        when 'medium' then 'État correct'
        else 'À inspecter'
      end,
      v_now + make_interval(secs => floor(85 + random() * 86)::integer)
    );
  end loop;
end;
$$;

create or replace function private.load_my_game_state()
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
  perform private.advance_game(v_player_id);
  return private.build_game_state(v_player_id);
end;
$$;

create or replace function public.game_action(
  p_action text,
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if p_action = 'START_REPAIR' then
    return private.perform_selected_repair(p_payload, p_request_id);
  end if;
  return private.perform_game_action(p_action, p_payload, p_request_id);
end;
$$;

drop function if exists private.perform_game_action_with_market(text, jsonb, uuid);
drop function if exists private.perform_tiered_market_action(text, jsonb, uuid);
drop function if exists private.with_market_state(uuid, jsonb);

alter table public.market_listings
  drop constraint if exists market_listings_market_tier_check,
  drop column if exists market_tier;

alter table private.vehicle_templates
  drop constraint if exists vehicle_templates_market_tier_check,
  drop column if exists market_tier;

alter table public.players
  drop column if exists market_standard_refresh_at,
  drop column if exists market_premium_refresh_at,
  drop column if exists market_collector_refresh_at;

commit;

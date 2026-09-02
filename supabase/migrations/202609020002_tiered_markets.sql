begin;

alter table private.vehicle_templates
  add column market_tier text;

update private.vehicle_templates
set market_tier = case
  when id in ('mini-f56', 'a3-8v', 'serie-1-f20', 'mx5-nd') then 'premium'
  else 'standard'
end;

insert into private.vehicle_templates
  (id, maker, model, segment, market_value, year_min, year_max, mileage_min, mileage_max, market_tier)
values
  ('m3-e46', 'BMW', 'M3 E46', 'Sportive de collection', 58000, 2001, 2005, 72000, 168000, 'collector'),
  ('911-996-carrera', 'Porsche', '911 Carrera 996', 'GT de collection', 52000, 1999, 2004, 78000, 176000, 'collector'),
  ('alpine-a110', 'Alpine', 'A110 Première Édition', 'Série limitée', 69000, 2018, 2019, 18000, 72000, 'collector'),
  ('ferrari-360-modena', 'Ferrari', '360 Modena', 'Supercar de collection', 96000, 1999, 2004, 34000, 102000, 'collector')
on conflict (id) do update set
  maker = excluded.maker,
  model = excluded.model,
  segment = excluded.segment,
  market_value = excluded.market_value,
  year_min = excluded.year_min,
  year_max = excluded.year_max,
  mileage_min = excluded.mileage_min,
  mileage_max = excluded.mileage_max,
  market_tier = excluded.market_tier;

alter table private.vehicle_templates
  alter column market_tier set not null,
  add constraint vehicle_templates_market_tier_check
    check (market_tier in ('standard', 'premium', 'collector'));

alter table public.market_listings
  add column market_tier text;

update public.market_listings as listing
set market_tier = template.market_tier
from private.vehicle_templates as template
where template.id = listing.template_id;

alter table public.market_listings
  alter column market_tier set not null,
  add constraint market_listings_market_tier_check
    check (market_tier in ('standard', 'premium', 'collector'));

alter table public.players
  add column market_standard_refresh_at timestamptz not null default clock_timestamp(),
  add column market_premium_refresh_at timestamptz not null default clock_timestamp(),
  add column market_collector_refresh_at timestamptz not null default clock_timestamp();

-- Les anciennes annonces sont éphémères : une rotation propre évite un marché hybride au déploiement.
delete from public.market_listings;

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
  v_market text;
  v_target integer;
  v_minimum_seconds integer;
  v_maximum_seconds integer;
  v_refresh_at timestamptz;
  v_next_refresh_at timestamptz;
  v_template private.vehicle_templates%rowtype;
  v_risk text;
  v_year integer;
  v_market_value bigint;
  v_asking_price bigint;
  v_mileage integer;
  v_factor numeric;
  v_now timestamptz := clock_timestamp();
begin
  -- p_target reste dans la signature pour conserver la compatibilité avec les fonctions existantes.
  perform p_target;

  delete from public.market_listings
  where player_id = p_player_id and expires_at <= v_now;

  for v_market, v_target, v_minimum_seconds, v_maximum_seconds in
    select * from (values
      ('standard'::text, 7, 120, 180),
      ('premium'::text, 4, 720, 1080),
      ('collector'::text, 2, 5400, 9000)
    ) as configuration(market_tier, target, minimum_seconds, maximum_seconds)
  loop
    select case v_market
      when 'standard' then player.market_standard_refresh_at
      when 'premium' then player.market_premium_refresh_at
      else player.market_collector_refresh_at
    end
    into v_refresh_at
    from public.players as player
    where player.id = p_player_id
    for update;

    if v_refresh_at is null or v_refresh_at <= v_now then
      delete from public.market_listings
      where player_id = p_player_id and market_tier = v_market;

      v_next_refresh_at := v_now + make_interval(
        secs => floor(v_minimum_seconds + random()
          * (v_maximum_seconds - v_minimum_seconds + 1))::integer
      );

      update public.players
      set market_standard_refresh_at = case
            when v_market = 'standard' then v_next_refresh_at
            else market_standard_refresh_at
          end,
          market_premium_refresh_at = case
            when v_market = 'premium' then v_next_refresh_at
            else market_premium_refresh_at
          end,
          market_collector_refresh_at = case
            when v_market = 'collector' then v_next_refresh_at
            else market_collector_refresh_at
          end
      where id = p_player_id;

      for v_template in
        select template.*
        from private.vehicle_templates as template
        where template.market_tier = v_market
        order by random()
        limit v_target
      loop
        v_factor := random();
        v_risk := case
          when v_factor < 0.36 then 'low'
          when v_factor < 0.76 then 'medium'
          else 'high'
        end;
        v_year := floor(v_template.year_min
          + random() * (v_template.year_max - v_template.year_min + 1));
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
          player_id, template_id, maker, model, segment, market_tier, year, mileage,
          asking_price, market_value, risk, condition_hint, expires_at
        ) values (
          p_player_id, v_template.id, v_template.maker, v_template.model,
          v_template.segment, v_market, v_year, v_mileage, v_asking_price, v_market_value,
          v_risk,
          case v_risk
            when 'low' then 'Semble soignée'
            when 'medium' then 'État correct'
            else 'À inspecter'
          end,
          v_next_refresh_at
        );
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function private.with_market_state(
  p_player_id uuid,
  p_state jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_set(
    jsonb_set(
      p_state,
      '{listings}',
      coalesce((
        select jsonb_agg(
          listing_element.value
            || jsonb_build_object('market', market_listing.market_tier)
          order by listing_element.ordinality
        )
        from jsonb_array_elements(coalesce(p_state -> 'listings', '[]'::jsonb))
          with ordinality as listing_element(value, ordinality)
        join public.market_listings as market_listing
          on market_listing.id = (listing_element.value ->> 'id')::uuid
          and market_listing.player_id = p_player_id
      ), '[]'::jsonb),
      true
    ),
    '{marketRefreshAt}',
    (
      select jsonb_build_object(
        'standard', (extract(epoch from player.market_standard_refresh_at) * 1000)::bigint,
        'premium', (extract(epoch from player.market_premium_refresh_at) * 1000)::bigint,
        'collector', (extract(epoch from player.market_collector_refresh_at) * 1000)::bigint
      )
      from public.players as player
      where player.id = p_player_id
    ),
    true
  );
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
  return private.with_market_state(v_player_id, private.build_game_state(v_player_id));
end;
$$;

create or replace function private.perform_tiered_market_action(
  p_action text,
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := (select auth.uid());
  v_state jsonb;
  v_model text;
  v_occupied integer;
begin
  select receipt.state_snapshot
  into v_state
  from private.action_receipts as receipt
  where receipt.player_id = v_player_id and receipt.request_id = p_request_id;

  if found then
    return private.with_market_state(v_player_id, v_state);
  end if;

  v_state := private.perform_game_action(p_action, p_payload, p_request_id);

  if p_action = 'BUY_LISTING' then
    select vehicle.model
    into v_model
    from public.owned_vehicles as vehicle
    where vehicle.player_id = v_player_id and vehicle.sold_at is null
    order by vehicle.acquired_at desc
    limit 1;

    select count(*)::integer
    into v_occupied
    from public.owned_vehicles as vehicle
    where vehicle.player_id = v_player_id and vehicle.sold_at is null;

    update public.notifications
    set message = v_model || ' achetée · ' || v_occupied || '/'
      || private.garage_capacity(v_player_id) || ' places occupées.',
      tone = 'success'
    where id = (
      select notification.id
      from public.notifications as notification
      where notification.player_id = v_player_id
      order by notification.created_at desc
      limit 1
    );

    v_state := private.build_game_state(v_player_id);
    update private.action_receipts
    set state_snapshot = v_state
    where player_id = v_player_id and request_id = p_request_id;
  end if;

  return private.with_market_state(v_player_id, v_state);
end;
$$;

create or replace function private.perform_game_action_with_market(
  p_action text,
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := (select auth.uid());
  v_state jsonb;
begin
  if p_action = 'START_REPAIR' then
    v_state := private.perform_selected_repair(p_payload, p_request_id);
    return private.with_market_state(v_player_id, v_state);
  end if;
  return private.perform_tiered_market_action(p_action, p_payload, p_request_id);
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
  return private.perform_game_action_with_market(p_action, p_payload, p_request_id);
end;
$$;

revoke execute on function private.with_market_state(uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.perform_tiered_market_action(text, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function private.perform_game_action_with_market(text, jsonb, uuid)
  from public, anon;
grant execute on function private.perform_game_action_with_market(text, jsonb, uuid)
  to authenticated;

comment on column private.vehicle_templates.market_tier is
  'Gamme de génération : standard, premium ou collector.';
comment on column public.market_listings.market_tier is
  'Gamme figée de l’annonce, utilisée pour le quota et la rotation indépendants.';
comment on function private.ensure_market_listings(uuid, integer) is
  'Rotation indépendante : 7 annonces standard / 2-3 min, 4 premium / 12-18 min, 2 collector / 90-150 min.';

commit;

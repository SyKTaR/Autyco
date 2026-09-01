begin;

create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table private.vehicle_templates (
  id text primary key,
  maker text not null,
  model text not null,
  segment text not null,
  market_value bigint not null check (market_value >= 1000),
  year_min smallint not null,
  year_max smallint not null,
  mileage_min integer not null check (mileage_min >= 0),
  mileage_max integer not null check (mileage_max >= mileage_min),
  check (year_max >= year_min)
);

create table private.problem_templates (
  id text primary key,
  label text not null,
  detail text not null,
  cost bigint not null check (cost >= 0),
  duration_seconds integer not null check (duration_seconds >= 0),
  resale_impact bigint not null check (resale_impact >= 0)
);

create table private.property_templates (
  id text primary key,
  name text not null,
  district text not null,
  description text not null,
  capacity integer not null check (capacity > 0),
  acquisition_mode text not null check (acquisition_mode in ('rent', 'purchase')),
  acquisition_cost bigint not null check (acquisition_cost >= 0),
  rent_per_cycle bigint not null check (rent_per_cycle >= 0),
  charges_per_cycle bigint not null check (charges_per_cycle >= 0),
  work_cost bigint not null check (work_cost >= 0),
  work_duration_seconds integer not null check (work_duration_seconds >= 0)
);

insert into private.vehicle_templates
  (id, maker, model, segment, market_value, year_min, year_max, mileage_min, mileage_max)
values
  ('clio-v', 'Renault', 'Clio V', 'Citadine', 13400, 2019, 2022, 38000, 104000),
  ('golf-vii', 'Volkswagen', 'Golf VII', 'Compacte', 15800, 2017, 2020, 56000, 132000),
  ('208-ii', 'Peugeot', '208 II', 'Citadine', 14600, 2020, 2023, 27000, 92000),
  ('mini-f56', 'Mini', 'Cooper F56', 'Citadine premium', 17900, 2016, 2020, 49000, 118000),
  ('a3-8v', 'Audi', 'A3 8V', 'Compacte premium', 19500, 2016, 2019, 68000, 139000),
  ('c3-iii', 'Citroën', 'C3 III', 'Citadine', 11200, 2018, 2022, 44000, 109000),
  ('captur-i', 'Renault', 'Captur I', 'SUV urbain', 13900, 2017, 2020, 58000, 127000),
  ('fiesta-vii', 'Ford', 'Fiesta VII', 'Citadine', 10900, 2018, 2021, 47000, 116000),
  ('yaris-iv', 'Toyota', 'Yaris IV', 'Hybride', 17300, 2020, 2023, 31000, 88000),
  ('serie-1-f20', 'BMW', 'Série 1 F20', 'Compacte premium', 18800, 2016, 2019, 71000, 143000),
  ('duster-ii', 'Dacia', 'Duster II', 'SUV', 15200, 2018, 2021, 52000, 124000),
  ('mx5-nd', 'Mazda', 'MX-5 ND', 'Roadster', 21500, 2016, 2019, 42000, 96000);

insert into private.problem_templates
  (id, label, detail, cost, duration_seconds, resale_impact)
values
  ('brakes', 'Freinage usé', 'Disques et plaquettes avant', 380, 5, 720),
  ('tires', 'Pneus à remplacer', 'Train de pneus en fin de vie', 460, 6, 780),
  ('timing', 'Distribution à prévoir', 'Échéance constructeur dépassée', 920, 10, 1450),
  ('battery', 'Batterie faible', 'Démarrage irrégulier à froid', 190, 3, 390),
  ('bodywork', 'Carrosserie marquée', 'Deux éléments à reprendre', 680, 8, 1080),
  ('service', 'Entretien en retard', 'Vidange, filtres et contrôles', 240, 4, 510);

insert into private.property_templates
  (id, name, district, description, capacity, acquisition_mode, acquisition_cost,
   rent_per_cycle, charges_per_cycle, work_cost, work_duration_seconds)
values
  ('box-quartier', 'Box de quartier', 'Faubourg',
   'Deux places sèches, disponibles immédiatement pour absorber les premières affaires.',
   2, 'rent', 2400, 180, 35, 0, 0),
  ('atelier-cour', 'Atelier de cour', 'Zone artisanale',
   'Un vrai espace de préparation, à remettre aux normes avant de recevoir du stock.',
   4, 'rent', 5500, 420, 80, 2500, 24),
  ('entrepot-peripherique', 'Entrepôt périphérique', 'Rocade nord',
   'Huit places et une structure durable pour passer d’opportuniste à marchand installé.',
   8, 'purchase', 42000, 0, 260, 7500, 45),
  ('showroom-avenue', 'Showroom avenue', 'Entrée de ville',
   'Une adresse vitrine à forte capacité, pensée pour une collection et un stock ambitieux.',
   12, 'purchase', 95000, 0, 650, 18000, 75);

create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  cash bigint not null default 20000,
  profit_today bigint not null default 0,
  profit_day_key date not null default current_date,
  garage_public boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

comment on column public.players.garage_public is
  'Prévu pour une future visibilité multijoueur. Aucune policy publique ne l’exploite encore.';

create table public.market_listings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  template_id text not null references private.vehicle_templates(id) on delete restrict,
  maker text not null,
  model text not null,
  segment text not null,
  year smallint not null,
  mileage integer not null check (mileage >= 0),
  asking_price bigint not null check (asking_price >= 1000),
  market_value bigint not null check (market_value >= 1000),
  risk text not null check (risk in ('low', 'medium', 'high')),
  condition_hint text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (player_id, template_id)
);

create table public.owned_vehicles (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  original_listing_id uuid not null,
  template_id text not null references private.vehicle_templates(id) on delete restrict,
  maker text not null,
  model text not null,
  segment text not null,
  year smallint not null,
  mileage integer not null check (mileage >= 0),
  purchase_price bigint not null check (purchase_price >= 0),
  market_value bigint not null check (market_value >= 1000),
  risk text not null check (risk in ('low', 'medium', 'high')),
  status text not null check (status in (
    'needs-diagnosis', 'needs-decision', 'repairing', 'ready',
    'listed', 'offer-received', 'sold'
  )),
  repair_costs bigint not null default 0 check (repair_costs >= 0),
  repairs_skipped boolean not null default false,
  kept boolean not null default false,
  acquired_at timestamptz not null default clock_timestamp(),
  repair_started_at timestamptz,
  repair_completes_at timestamptz,
  asking_price bigint check (asking_price is null or asking_price >= 1000),
  sale_chance numeric(5,4) check (sale_chance is null or sale_chance between 0 and 1),
  next_offer_at timestamptz,
  offer_amount bigint check (offer_amount is null or offer_amount >= 0),
  sold_at timestamptz,
  sale_price bigint check (sale_price is null or sale_price >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  check ((status = 'sold' and sold_at is not null) or (status <> 'sold' and sold_at is null))
);

create table public.vehicle_problems (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.owned_vehicles(id) on delete cascade,
  problem_id text not null references private.problem_templates(id) on delete restrict,
  label text not null,
  detail text not null,
  cost bigint not null check (cost >= 0),
  duration_seconds integer not null check (duration_seconds >= 0),
  resale_impact bigint not null check (resale_impact >= 0),
  repaired boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique (vehicle_id, problem_id)
);

create table public.owned_properties (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  template_id text not null references private.property_templates(id) on delete restrict,
  name text not null,
  district text not null,
  description text not null,
  capacity integer not null check (capacity > 0),
  acquisition_mode text not null check (acquisition_mode in ('rent', 'purchase')),
  acquisition_cost bigint not null check (acquisition_cost >= 0),
  rent_per_cycle bigint not null check (rent_per_cycle >= 0),
  charges_per_cycle bigint not null check (charges_per_cycle >= 0),
  work_cost bigint not null check (work_cost >= 0),
  work_duration_seconds integer not null check (work_duration_seconds >= 0),
  status text not null check (status in ('works-required', 'renovating', 'operational')),
  acquired_at timestamptz not null default clock_timestamp(),
  next_charge_at timestamptz not null,
  work_started_at timestamptz,
  work_completes_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique (player_id, template_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in (
    'vehicle_purchase', 'vehicle_sale', 'vehicle_repair',
    'property_acquisition', 'property_works', 'property_charges'
  )),
  cash_delta bigint not null,
  balance_after bigint not null,
  vehicle_id uuid references public.owned_vehicles(id) on delete set null,
  property_id uuid references public.owned_properties(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);

create table public.game_events (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  tone text not null check (tone in ('neutral', 'success', 'warning')),
  message text not null,
  created_at timestamptz not null default clock_timestamp()
);

create table private.action_receipts (
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  action text not null,
  state_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (player_id, request_id)
);

create index market_listings_player_expires_idx
  on public.market_listings (player_id, expires_at);
create index owned_vehicles_player_idx on public.owned_vehicles (player_id);
create index owned_vehicles_player_status_idx
  on public.owned_vehicles (player_id, status) where sold_at is null;
create index vehicle_problems_vehicle_idx on public.vehicle_problems (vehicle_id);
create index owned_properties_player_status_idx
  on public.owned_properties (player_id, status);
create index transactions_player_created_idx
  on public.transactions (player_id, created_at desc);
create index transactions_vehicle_idx on public.transactions (vehicle_id)
  where vehicle_id is not null;
create index transactions_property_idx on public.transactions (property_id)
  where property_id is not null;
create index game_events_player_created_idx
  on public.game_events (player_id, created_at desc);
create index notifications_player_created_idx
  on public.notifications (player_id, created_at desc);
create index action_receipts_created_idx on private.action_receipts (created_at);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger players_set_updated_at
before update on public.players
for each row execute function private.set_updated_at();

create trigger owned_vehicles_set_updated_at
before update on public.owned_vehicles
for each row execute function private.set_updated_at();

create trigger owned_properties_set_updated_at
before update on public.owned_properties
for each row execute function private.set_updated_at();

create or replace function private.add_notification(
  p_player_id uuid,
  p_message text,
  p_tone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tone not in ('neutral', 'success', 'warning') then
    raise exception 'Ton de notification invalide.' using errcode = '22023';
  end if;

  insert into public.notifications (player_id, message, tone)
  values (p_player_id, p_message, p_tone);

  delete from public.notifications
  where player_id = p_player_id
    and id in (
      select id
      from public.notifications
      where player_id = p_player_id
      order by created_at desc
      offset 20
    );
end;
$$;

create or replace function private.record_event(
  p_player_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.game_events (player_id, event_type, payload)
  values (p_player_id, p_event_type, coalesce(p_payload, '{}'::jsonb));
$$;

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

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_player(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_garage_game on auth.users;
create trigger on_auth_user_created_garage_game
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.garage_capacity(p_player_id uuid)
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select 3 + coalesce(sum(capacity) filter (where status = 'operational'), 0)::integer
  from public.owned_properties
  where player_id = p_player_id;
$$;

create or replace function private.vehicle_resale_value(p_vehicle_id uuid)
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  select greatest(
    1000::bigint,
    round((vehicle.market_value - coalesce(sum(problem.resale_impact)
      filter (where not problem.repaired), 0)) / 100.0)::bigint * 100
  )
  from public.owned_vehicles as vehicle
  left join public.vehicle_problems as problem on problem.vehicle_id = vehicle.id
  where vehicle.id = p_vehicle_id
  group by vehicle.id, vehicle.market_value;
$$;

create or replace function private.sale_chance(p_vehicle_id uuid, p_price bigint)
returns numeric
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_fair_value bigint := private.vehicle_resale_value(p_vehicle_id);
  v_ratio numeric;
begin
  if v_fair_value is null or p_price < 1000 then
    raise exception 'Prix ou véhicule invalide.' using errcode = '22023';
  end if;
  v_ratio := p_price::numeric / v_fair_value;
  return case
    when v_ratio <= 0.94 then 0.88
    when v_ratio <= 0.99 then 0.74
    when v_ratio <= 1.03 then 0.58
    when v_ratio <= 1.08 then 0.39
    else 0.24
  end;
end;
$$;

create or replace function private.advance_game(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_vehicle public.owned_vehicles%rowtype;
  v_property public.owned_properties%rowtype;
  v_fair_value bigint;
  v_offer bigint;
  v_cycles integer;
  v_charge bigint;
  v_total_charge bigint := 0;
  v_balance bigint;
begin
  update public.players
  set profit_today = 0, profit_day_key = current_date
  where id = p_player_id and profit_day_key <> current_date;

  for v_vehicle in
    update public.owned_vehicles
    set status = 'ready', repair_completes_at = null
    where player_id = p_player_id
      and status = 'repairing'
      and repair_completes_at <= v_now
    returning *
  loop
    update public.vehicle_problems
    set repaired = true
    where vehicle_id = v_vehicle.id;
    perform private.add_notification(
      p_player_id,
      v_vehicle.model || ' réparée. Elle peut maintenant être mise en vente.',
      'success'
    );
    perform private.record_event(p_player_id, 'vehicle_repair_completed',
      jsonb_build_object('vehicleId', v_vehicle.id));
  end loop;

  for v_vehicle in
    select *
    from public.owned_vehicles
    where player_id = p_player_id
      and status = 'listed'
      and next_offer_at <= v_now
    for update
  loop
    if random() <= coalesce(v_vehicle.sale_chance, 0.5) then
      v_fair_value := private.vehicle_resale_value(v_vehicle.id);
      v_offer := round((least(
        v_vehicle.asking_price * (0.92 + random() * 0.085),
        v_fair_value * 1.04
      )) / 100.0) * 100;
      update public.owned_vehicles
      set status = 'offer-received', offer_amount = v_offer, next_offer_at = null
      where id = v_vehicle.id;
      perform private.add_notification(
        p_player_id,
        'Nouvelle offre pour la ' || v_vehicle.model || ' : ' || v_offer || ' €.',
        'success'
      );
      perform private.record_event(p_player_id, 'vehicle_offer_received',
        jsonb_build_object('vehicleId', v_vehicle.id, 'offerAmount', v_offer));
    else
      update public.owned_vehicles
      set next_offer_at = v_now + make_interval(secs => floor(6 + random() * 6)::integer)
      where id = v_vehicle.id;
    end if;
  end loop;

  for v_property in
    update public.owned_properties
    set status = 'operational', work_completes_at = null
    where player_id = p_player_id
      and status = 'renovating'
      and work_completes_at <= v_now
    returning *
  loop
    perform private.add_notification(
      p_player_id,
      v_property.name || ' est opérationnel · +' || v_property.capacity || ' places.',
      'success'
    );
    perform private.record_event(p_player_id, 'property_works_completed',
      jsonb_build_object('propertyId', v_property.id));
  end loop;

  for v_property in
    select *
    from public.owned_properties
    where player_id = p_player_id and next_charge_at <= v_now
    for update
  loop
    v_cycles := floor(extract(epoch from (v_now - v_property.next_charge_at)) / 86400)::integer + 1;
    v_charge := (v_property.rent_per_cycle + v_property.charges_per_cycle) * v_cycles;
    v_total_charge := v_total_charge + v_charge;
    update public.owned_properties
    set next_charge_at = next_charge_at + (interval '1 day' * v_cycles)
    where id = v_property.id;
  end loop;

  if v_total_charge > 0 then
    update public.players
    set cash = cash - v_total_charge
    where id = p_player_id
    returning cash into v_balance;

    insert into public.transactions (player_id, kind, cash_delta, balance_after, metadata)
    values (p_player_id, 'property_charges', -v_total_charge, v_balance,
      jsonb_build_object('cyclesConsolidated', true));

    perform private.add_notification(
      p_player_id,
      'Échéances immobilières prélevées : ' || v_total_charge || ' €.',
      case when v_balance < 0 then 'warning' else 'neutral' end
    );
    if v_balance < 0 then
      perform private.add_notification(
        p_player_id,
        'Découvert : −' || abs(v_balance) || ' €, réduis tes charges ou vends un véhicule.',
        'warning'
      );
    end if;
  end if;

  perform private.ensure_market_listings(p_player_id, 10);
end;
$$;

create or replace function private.build_game_state(p_player_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'version', 2,
    'cash', player.cash,
    'profitToday', player.profit_today,
    'profitDayKey', to_char(player.profit_day_key, 'YYYY-MM-DD'),
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', vehicle.id::text,
        'listingId', vehicle.original_listing_id::text,
        'templateId', vehicle.template_id,
        'maker', vehicle.maker,
        'model', vehicle.model,
        'segment', vehicle.segment,
        'year', vehicle.year,
        'mileage', vehicle.mileage,
        'purchasePrice', vehicle.purchase_price,
        'marketValue', vehicle.market_value,
        'risk', vehicle.risk,
        'status', vehicle.status,
        'problems', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', problem.problem_id,
            'label', problem.label,
            'detail', problem.detail,
            'cost', problem.cost,
            'durationSeconds', problem.duration_seconds,
            'resaleImpact', problem.resale_impact,
            'repaired', problem.repaired
          ) order by problem.created_at)
          from public.vehicle_problems as problem
          where problem.vehicle_id = vehicle.id
        ), '[]'::jsonb),
        'repairCosts', vehicle.repair_costs,
        'repairsSkipped', vehicle.repairs_skipped,
        'kept', vehicle.kept,
        'acquiredAt', (extract(epoch from vehicle.acquired_at) * 1000)::bigint,
        'repairStartedAt', case when vehicle.repair_started_at is null then null
          else (extract(epoch from vehicle.repair_started_at) * 1000)::bigint end,
        'repairCompletesAt', case when vehicle.repair_completes_at is null then null
          else (extract(epoch from vehicle.repair_completes_at) * 1000)::bigint end,
        'askingPrice', vehicle.asking_price,
        'saleChance', vehicle.sale_chance,
        'nextOfferAt', case when vehicle.next_offer_at is null then null
          else (extract(epoch from vehicle.next_offer_at) * 1000)::bigint end,
        'offerAmount', vehicle.offer_amount
      ) order by vehicle.acquired_at)
      from public.owned_vehicles as vehicle
      where vehicle.player_id = p_player_id and vehicle.sold_at is null
    ), '[]'::jsonb),
    'properties', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', property.template_id,
        'instanceId', property.id::text,
        'name', property.name,
        'district', property.district,
        'description', property.description,
        'capacity', property.capacity,
        'acquisitionMode', property.acquisition_mode,
        'acquisitionCost', property.acquisition_cost,
        'rentPerCycle', property.rent_per_cycle,
        'chargesPerCycle', property.charges_per_cycle,
        'workCost', property.work_cost,
        'workDurationSeconds', property.work_duration_seconds,
        'status', property.status,
        'acquiredAt', (extract(epoch from property.acquired_at) * 1000)::bigint,
        'nextChargeAt', (extract(epoch from property.next_charge_at) * 1000)::bigint,
        'workStartedAt', case when property.work_started_at is null then null
          else (extract(epoch from property.work_started_at) * 1000)::bigint end,
        'workCompletesAt', case when property.work_completes_at is null then null
          else (extract(epoch from property.work_completes_at) * 1000)::bigint end
      ) order by property.acquired_at)
      from public.owned_properties as property
      where property.player_id = p_player_id
    ), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', listing.id::text,
        'templateId', listing.template_id,
        'maker', listing.maker,
        'model', listing.model,
        'segment', listing.segment,
        'year', listing.year,
        'mileage', listing.mileage,
        'askingPrice', listing.asking_price,
        'marketValue', listing.market_value,
        'risk', listing.risk,
        'conditionHint', listing.condition_hint,
        'expiresAt', (extract(epoch from listing.expires_at) * 1000)::bigint
      ) order by listing.created_at)
      from public.market_listings as listing
      where listing.player_id = p_player_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(notification_row.payload order by notification_row.created_at)
      from (
        select notification.created_at, jsonb_build_object(
          'id', notification.id::text,
          'tone', notification.tone,
          'message', notification.message
        ) as payload
        from public.notifications as notification
        where notification.player_id = p_player_id
        order by notification.created_at desc
        limit 3
      ) as notification_row
    ), '[]'::jsonb)
  )
  from public.players as player
  where player.id = p_player_id;
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

create or replace function private.perform_game_action(
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
  v_listing public.market_listings%rowtype;
  v_vehicle public.owned_vehicles%rowtype;
  v_property public.owned_properties%rowtype;
  v_property_template private.property_templates%rowtype;
  v_problem private.problem_templates%rowtype;
  v_vehicle_id uuid;
  v_entity_id uuid;
  v_problem_count integer;
  v_cost bigint;
  v_duration integer;
  v_balance bigint;
  v_price bigint;
  v_profit bigint;
  v_kept boolean;
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Identifiant de requête requis.' using errcode = '22023';
  end if;

  select receipt.state_snapshot
  into v_state
  from private.action_receipts as receipt
  where receipt.player_id = v_player_id and receipt.request_id = p_request_id;
  if found then
    return v_state;
  end if;

  perform private.ensure_player(v_player_id);
  perform private.advance_game(v_player_id);
  p_payload := coalesce(p_payload, '{}'::jsonb);

  if p_action = 'BUY_LISTING' then
    v_entity_id := (p_payload ->> 'listingId')::uuid;
    select * into v_listing
    from public.market_listings
    where id = v_entity_id and player_id = v_player_id
    for update;
    if not found then
      raise exception 'Cette annonce n’est plus disponible.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.owned_vehicles
        where player_id = v_player_id and sold_at is null) >= private.garage_capacity(v_player_id) then
      raise exception 'Le garage est complet.' using errcode = 'P0001';
    end if;
    select cash into v_balance from public.players where id = v_player_id for update;
    if v_balance < v_listing.asking_price then
      raise exception 'Trésorerie insuffisante pour cet achat.' using errcode = 'P0001';
    end if;

    insert into public.owned_vehicles (
      player_id, original_listing_id, template_id, maker, model, segment, year,
      mileage, purchase_price, market_value, risk, status
    ) values (
      v_player_id, v_listing.id, v_listing.template_id, v_listing.maker,
      v_listing.model, v_listing.segment, v_listing.year, v_listing.mileage,
      v_listing.asking_price, v_listing.market_value, v_listing.risk, 'needs-diagnosis'
    ) returning id into v_vehicle_id;
    update public.players set cash = cash - v_listing.asking_price
    where id = v_player_id returning cash into v_balance;
    delete from public.market_listings where id = v_listing.id;
    insert into public.transactions
      (player_id, kind, cash_delta, balance_after, vehicle_id, metadata)
    values
      (v_player_id, 'vehicle_purchase', -v_listing.asking_price, v_balance, v_vehicle_id,
       jsonb_build_object('listingId', v_listing.id, 'templateId', v_listing.template_id));
    perform private.record_event(v_player_id, 'vehicle_purchased',
      jsonb_build_object('vehicleId', v_vehicle_id, 'listingId', v_listing.id));
    perform private.add_notification(v_player_id,
      v_listing.model || ' achetée. Direction le diagnostic.', 'neutral');

  elsif p_action = 'IGNORE_LISTING' then
    v_entity_id := (p_payload ->> 'listingId')::uuid;
    delete from public.market_listings
    where id = v_entity_id and player_id = v_player_id;

  elsif p_action = 'DIAGNOSE_VEHICLE' then
    v_entity_id := (p_payload ->> 'vehicleId')::uuid;
    select * into v_vehicle
    from public.owned_vehicles
    where id = v_entity_id and player_id = v_player_id and sold_at is null
    for update;
    if not found or v_vehicle.status <> 'needs-diagnosis' then
      raise exception 'Ce véhicule ne peut pas être diagnostiqué.' using errcode = 'P0001';
    end if;
    v_problem_count := case v_vehicle.risk
      when 'low' then 1
      when 'medium' then 1 + floor(random() * 2)::integer
      else 2 + floor(random() * 2)::integer
    end;
    v_cost := 0;
    for v_problem in
      select problem.* from private.problem_templates as problem
      order by random() limit v_problem_count
    loop
      insert into public.vehicle_problems
        (vehicle_id, problem_id, label, detail, cost, duration_seconds, resale_impact)
      values
        (v_vehicle.id, v_problem.id, v_problem.label, v_problem.detail,
         v_problem.cost, v_problem.duration_seconds, v_problem.resale_impact);
      v_cost := v_cost + v_problem.cost;
    end loop;
    update public.owned_vehicles set status = 'needs-decision' where id = v_vehicle.id;
    perform private.record_event(v_player_id, 'vehicle_diagnosed',
      jsonb_build_object('vehicleId', v_vehicle.id, 'problemCount', v_problem_count));
    perform private.add_notification(v_player_id,
      'Diagnostic terminé : ' || v_problem_count || ' poste(s), ' || v_cost || ' € à prévoir.',
      case when v_problem_count > 1 then 'warning' else 'neutral' end);

  elsif p_action = 'START_REPAIR' then
    v_entity_id := (p_payload ->> 'vehicleId')::uuid;
    select * into v_vehicle
    from public.owned_vehicles
    where id = v_entity_id and player_id = v_player_id and sold_at is null
    for update;
    if not found or v_vehicle.status <> 'needs-decision' then
      raise exception 'Ces réparations ne peuvent pas être lancées.' using errcode = 'P0001';
    end if;
    select coalesce(sum(cost) filter (where not repaired), 0),
      least(18, greatest(6, round(coalesce(sum(duration_seconds) filter (where not repaired), 0) * 0.72)))::integer
    into v_cost, v_duration
    from public.vehicle_problems where vehicle_id = v_vehicle.id;
    select cash into v_balance from public.players where id = v_player_id for update;
    if v_cost <= 0 or v_balance < v_cost then
      raise exception 'Trésorerie insuffisante ou réparation invalide.' using errcode = 'P0001';
    end if;
    update public.players set cash = cash - v_cost
    where id = v_player_id returning cash into v_balance;
    update public.owned_vehicles
    set repair_costs = repair_costs + v_cost, repair_started_at = clock_timestamp(),
      repair_completes_at = clock_timestamp() + make_interval(secs => v_duration),
      status = 'repairing'
    where id = v_vehicle.id;
    insert into public.transactions
      (player_id, kind, cash_delta, balance_after, vehicle_id)
    values (v_player_id, 'vehicle_repair', -v_cost, v_balance, v_vehicle.id);
    perform private.record_event(v_player_id, 'vehicle_repair_started',
      jsonb_build_object('vehicleId', v_vehicle.id, 'cost', v_cost));
    perform private.add_notification(v_player_id,
      'Réparations lancées sur la ' || v_vehicle.model || '.', 'neutral');

  elsif p_action = 'SKIP_REPAIR' then
    v_entity_id := (p_payload ->> 'vehicleId')::uuid;
    update public.owned_vehicles
    set repairs_skipped = true, status = 'ready'
    where id = v_entity_id and player_id = v_player_id
      and sold_at is null and status = 'needs-decision'
    returning * into v_vehicle;
    if not found then
      raise exception 'Ce véhicule ne peut pas être vendu en l’état.' using errcode = 'P0001';
    end if;
    perform private.record_event(v_player_id, 'vehicle_repair_skipped',
      jsonb_build_object('vehicleId', v_vehicle.id));
    perform private.add_notification(v_player_id,
      v_vehicle.model || ' préparée pour une vente en l’état.', 'warning');

  elsif p_action = 'LIST_VEHICLE' then
    v_entity_id := (p_payload ->> 'vehicleId')::uuid;
    if jsonb_typeof(p_payload -> 'price') is distinct from 'number' then
      raise exception 'Prix de vente invalide.' using errcode = '22023';
    end if;
    v_price := round(((p_payload ->> 'price')::numeric) / 100.0) * 100;
    select * into v_vehicle
    from public.owned_vehicles
    where id = v_entity_id and player_id = v_player_id and sold_at is null
    for update;
    if not found or v_vehicle.status <> 'ready' or v_vehicle.kept or v_price < 1000 then
      raise exception 'Ce véhicule ne peut pas être mis en vente à ce prix.' using errcode = 'P0001';
    end if;
    update public.owned_vehicles
    set asking_price = v_price,
      sale_chance = private.sale_chance(v_vehicle.id, v_price),
      next_offer_at = clock_timestamp() + make_interval(secs => floor(7 + random() * 7)::integer),
      offer_amount = null, status = 'listed'
    where id = v_vehicle.id;
    perform private.record_event(v_player_id, 'vehicle_listed',
      jsonb_build_object('vehicleId', v_vehicle.id, 'askingPrice', v_price));
    perform private.add_notification(v_player_id,
      v_vehicle.model || ' publiée à ' || v_price || ' €.', 'neutral');

  elsif p_action = 'ACCEPT_OFFER' then
    v_entity_id := (p_payload ->> 'vehicleId')::uuid;
    select * into v_vehicle
    from public.owned_vehicles
    where id = v_entity_id and player_id = v_player_id and sold_at is null
    for update;
    if not found or v_vehicle.status <> 'offer-received' or v_vehicle.kept
       or v_vehicle.offer_amount is null then
      raise exception 'Cette offre ne peut pas être acceptée.' using errcode = 'P0001';
    end if;
    v_profit := v_vehicle.offer_amount - v_vehicle.purchase_price - v_vehicle.repair_costs;
    update public.players
    set cash = cash + v_vehicle.offer_amount,
      profit_today = profit_today + v_profit
    where id = v_player_id returning cash into v_balance;
    update public.owned_vehicles
    set status = 'sold', sold_at = clock_timestamp(), sale_price = offer_amount,
      next_offer_at = null
    where id = v_vehicle.id;
    insert into public.transactions
      (player_id, kind, cash_delta, balance_after, vehicle_id, metadata)
    values (v_player_id, 'vehicle_sale', v_vehicle.offer_amount, v_balance, v_vehicle.id,
      jsonb_build_object('profit', v_profit));
    perform private.record_event(v_player_id, 'vehicle_sold',
      jsonb_build_object('vehicleId', v_vehicle.id, 'amount', v_vehicle.offer_amount,
        'profit', v_profit));
    perform private.add_notification(v_player_id,
      v_vehicle.model || ' vendue : +' || v_vehicle.offer_amount || ' € · marge '
      || case when v_profit >= 0 then '+' else '−' end || abs(v_profit) || ' €.',
      case when v_profit >= 0 then 'success' else 'warning' end);

  elsif p_action = 'REJECT_OFFER' then
    v_entity_id := (p_payload ->> 'vehicleId')::uuid;
    update public.owned_vehicles
    set offer_amount = null, status = 'listed',
      next_offer_at = clock_timestamp() + make_interval(secs => floor(6 + random() * 6)::integer)
    where id = v_entity_id and player_id = v_player_id
      and sold_at is null and status = 'offer-received'
    returning * into v_vehicle;
    if not found then
      raise exception 'Cette offre ne peut pas être refusée.' using errcode = 'P0001';
    end if;
    perform private.record_event(v_player_id, 'vehicle_offer_rejected',
      jsonb_build_object('vehicleId', v_vehicle.id));
    perform private.add_notification(v_player_id,
      'Offre refusée pour la ' || v_vehicle.model || '. L’annonce reste active.', 'neutral');

  elsif p_action = 'TOGGLE_VEHICLE_KEPT' then
    v_entity_id := (p_payload ->> 'vehicleId')::uuid;
    select * into v_vehicle
    from public.owned_vehicles
    where id = v_entity_id and player_id = v_player_id and sold_at is null
    for update;
    if not found then
      raise exception 'Véhicule introuvable.' using errcode = 'P0001';
    end if;
    v_kept := not v_vehicle.kept;
    update public.owned_vehicles
    set kept = v_kept,
      status = case when v_kept and status in ('listed', 'offer-received') then 'ready' else status end,
      asking_price = case when v_kept and status in ('listed', 'offer-received') then null else asking_price end,
      sale_chance = case when v_kept and status in ('listed', 'offer-received') then null else sale_chance end,
      next_offer_at = case when v_kept and status in ('listed', 'offer-received') then null else next_offer_at end,
      offer_amount = case when v_kept and status in ('listed', 'offer-received') then null else offer_amount end
    where id = v_vehicle.id;
    perform private.record_event(v_player_id, 'vehicle_collection_toggled',
      jsonb_build_object('vehicleId', v_vehicle.id, 'kept', v_kept));
    perform private.add_notification(v_player_id,
      case when v_kept
        then v_vehicle.model || ' rejoint la collection.'
        else v_vehicle.model || ' repasse dans le stock actif.'
      end, 'neutral');

  elsif p_action = 'ACQUIRE_PROPERTY' then
    select * into v_property_template
    from private.property_templates
    where id = p_payload ->> 'offerId';
    if not found then
      raise exception 'Ce local n’existe pas.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.owned_properties
      where player_id = v_player_id and template_id = v_property_template.id) then
      raise exception 'Ce local est déjà dans ton parc.' using errcode = 'P0001';
    end if;
    select cash into v_balance from public.players where id = v_player_id for update;
    if v_balance < v_property_template.acquisition_cost then
      raise exception 'Trésorerie insuffisante pour acquérir ce local.' using errcode = 'P0001';
    end if;
    insert into public.owned_properties (
      player_id, template_id, name, district, description, capacity, acquisition_mode,
      acquisition_cost, rent_per_cycle, charges_per_cycle, work_cost,
      work_duration_seconds, status, next_charge_at
    ) values (
      v_player_id, v_property_template.id, v_property_template.name,
      v_property_template.district, v_property_template.description,
      v_property_template.capacity, v_property_template.acquisition_mode,
      v_property_template.acquisition_cost, v_property_template.rent_per_cycle,
      v_property_template.charges_per_cycle, v_property_template.work_cost,
      v_property_template.work_duration_seconds,
      case when v_property_template.work_cost = 0 then 'operational' else 'works-required' end,
      clock_timestamp() + interval '1 day'
    ) returning * into v_property;
    update public.players set cash = cash - v_property_template.acquisition_cost
    where id = v_player_id returning cash into v_balance;
    insert into public.transactions
      (player_id, kind, cash_delta, balance_after, property_id, metadata)
    values (v_player_id, 'property_acquisition', -v_property_template.acquisition_cost,
      v_balance, v_property.id, jsonb_build_object('templateId', v_property_template.id));
    perform private.record_event(v_player_id, 'property_acquired',
      jsonb_build_object('propertyId', v_property.id));
    perform private.add_notification(v_player_id,
      case when v_property.status = 'operational'
        then v_property.name || ' opérationnel · +' || v_property.capacity || ' places.'
        else v_property.name || ' acquis. Les travaux restent à lancer.'
      end, 'success');

  elsif p_action = 'START_PROPERTY_WORKS' then
    v_entity_id := (p_payload ->> 'propertyId')::uuid;
    select * into v_property
    from public.owned_properties
    where id = v_entity_id and player_id = v_player_id
    for update;
    if not found or v_property.status <> 'works-required' then
      raise exception 'Ces travaux ne peuvent pas être lancés.' using errcode = 'P0001';
    end if;
    select cash into v_balance from public.players where id = v_player_id for update;
    if v_balance < v_property.work_cost then
      raise exception 'Trésorerie insuffisante pour lancer ces travaux.' using errcode = 'P0001';
    end if;
    update public.players set cash = cash - v_property.work_cost
    where id = v_player_id returning cash into v_balance;
    update public.owned_properties
    set status = 'renovating', work_started_at = clock_timestamp(),
      work_completes_at = clock_timestamp() + make_interval(secs => v_property.work_duration_seconds)
    where id = v_property.id;
    insert into public.transactions
      (player_id, kind, cash_delta, balance_after, property_id)
    values (v_player_id, 'property_works', -v_property.work_cost, v_balance, v_property.id);
    perform private.record_event(v_player_id, 'property_works_started',
      jsonb_build_object('propertyId', v_property.id, 'cost', v_property.work_cost));
    perform private.add_notification(v_player_id,
      'Travaux lancés dans ' || v_property.name || '.', 'neutral');

  elsif p_action = 'DISMISS_NOTIFICATION' then
    v_entity_id := (p_payload ->> 'notificationId')::uuid;
    delete from public.notifications
    where id = v_entity_id and player_id = v_player_id;

  elsif p_action = 'TICK' then
    null;

  else
    raise exception 'Action de jeu inconnue.' using errcode = '22023';
  end if;

  perform private.ensure_market_listings(v_player_id, 10);
  v_state := private.build_game_state(v_player_id);
  insert into private.action_receipts (player_id, request_id, action, state_snapshot)
  values (v_player_id, p_request_id, p_action, v_state);
  delete from private.action_receipts
  where player_id = v_player_id
    and created_at < clock_timestamp() - interval '30 days';
  return v_state;
end;
$$;

alter table public.players enable row level security;
alter table public.market_listings enable row level security;
alter table public.owned_vehicles enable row level security;
alter table public.vehicle_problems enable row level security;
alter table public.owned_properties enable row level security;
alter table public.transactions enable row level security;
alter table public.game_events enable row level security;
alter table public.notifications enable row level security;

create policy players_select_own on public.players
for select to authenticated
using ((select auth.uid()) is not null and id = (select auth.uid()));

create policy market_listings_select_own on public.market_listings
for select to authenticated
using ((select auth.uid()) is not null and player_id = (select auth.uid()));

create policy owned_vehicles_select_own on public.owned_vehicles
for select to authenticated
using ((select auth.uid()) is not null and player_id = (select auth.uid()));

create policy vehicle_problems_select_own on public.vehicle_problems
for select to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.owned_vehicles as vehicle
    where vehicle.id = vehicle_problems.vehicle_id
      and vehicle.player_id = (select auth.uid())
  )
);

create policy owned_properties_select_own on public.owned_properties
for select to authenticated
using ((select auth.uid()) is not null and player_id = (select auth.uid()));

create policy transactions_select_own on public.transactions
for select to authenticated
using ((select auth.uid()) is not null and player_id = (select auth.uid()));

create policy game_events_select_own on public.game_events
for select to authenticated
using ((select auth.uid()) is not null and player_id = (select auth.uid()));

create policy notifications_select_own on public.notifications
for select to authenticated
using ((select auth.uid()) is not null and player_id = (select auth.uid()));

revoke all on public.players, public.market_listings, public.owned_vehicles,
  public.vehicle_problems, public.owned_properties, public.transactions,
  public.game_events, public.notifications from anon, authenticated;
grant select on public.players, public.market_listings, public.owned_vehicles,
  public.vehicle_problems, public.owned_properties, public.transactions,
  public.game_events, public.notifications to authenticated;

create or replace function public.get_game_state()
returns jsonb
language sql
set search_path = ''
as $$
  select private.load_my_game_state();
$$;

create or replace function public.game_action(
  p_action text,
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language sql
set search_path = ''
as $$
  select private.perform_game_action(p_action, p_payload, p_request_id);
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.get_game_state() from public, anon;
revoke execute on function public.game_action(text, jsonb, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.load_my_game_state() to authenticated;
grant execute on function private.perform_game_action(text, jsonb, uuid) to authenticated;
grant execute on function public.get_game_state() to authenticated;
grant execute on function public.game_action(text, jsonb, uuid) to authenticated;

comment on function public.game_action(text, jsonb, uuid) is
  'Point d’entrée authentifié. Les mutations économiques sont recalculées et validées dans private.perform_game_action.';

commit;

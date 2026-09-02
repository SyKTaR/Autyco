begin;

insert into private.property_templates
  (id, name, district, description, capacity, acquisition_mode, acquisition_cost,
   rent_per_cycle, charges_per_cycle, work_cost, work_duration_seconds)
values (
  'grand-garage-autyco',
  'Grand Garage AUTYCO',
  'Boulevard des ateliers',
  'Le siège de ton empire : 24 places, une galerie de collection et les espaces nécessaires pour constituer une équipe.',
  24, 'purchase', 750000, 0, 4500, 0, 0
)
on conflict (id) do update set
  name = excluded.name,
  district = excluded.district,
  description = excluded.description,
  capacity = excluded.capacity,
  acquisition_mode = excluded.acquisition_mode,
  acquisition_cost = excluded.acquisition_cost,
  rent_per_cycle = excluded.rent_per_cycle,
  charges_per_cycle = excluded.charges_per_cycle,
  work_cost = excluded.work_cost,
  work_duration_seconds = excluded.work_duration_seconds;

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  role text not null check (role in ('mechanic', 'salesperson')),
  salary_per_cycle bigint not null check (salary_per_cycle > 0),
  status text not null default 'active' check (status in ('active', 'paused')),
  pause_reason text check (pause_reason is null or pause_reason in ('manual', 'payroll')),
  salary_arrears bigint not null default 0 check (salary_arrears >= 0),
  hired_at timestamptz not null default clock_timestamp(),
  next_payroll_at timestamptz not null default (clock_timestamp() + interval '1 day')
);

create unique index staff_members_single_salesperson
  on public.staff_members (player_id) where role = 'salesperson';
create index staff_members_player_role_idx on public.staff_members (player_id, role);

create table private.empire_settings (
  player_id uuid primary key references public.players(id) on delete cascade,
  commercial_enabled boolean not null default true,
  commercial_max_purchase_price bigint not null default 35000
    check (commercial_max_purchase_price between 5000 and 100000),
  commercial_min_discount_percent integer not null default 16
    check (commercial_min_discount_percent between 5 and 35),
  commercial_market_profile text not null default 'both'
    check (commercial_market_profile in ('standard', 'premium', 'both')),
  next_commercial_action_at timestamptz not null
    default (clock_timestamp() + interval '60 seconds'),
  next_showroom_offer_at timestamptz not null
    default (clock_timestamp() + interval '16 minutes')
);

create table public.mechanic_jobs (
  employee_id uuid primary key references public.staff_members(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  vehicle_id uuid not null unique references public.owned_vehicles(id) on delete cascade,
  stage text not null check (stage in ('diagnosis', 'repair', 'listing')),
  started_at timestamptz not null default clock_timestamp(),
  completes_at timestamptz not null
);

create index mechanic_jobs_player_due_idx on public.mechanic_jobs (player_id, completes_at);

create table public.showroom_slots (
  player_id uuid not null references public.players(id) on delete cascade,
  vehicle_id uuid primary key references public.owned_vehicles(id) on delete cascade,
  exposed_at timestamptz not null default clock_timestamp()
);

create index showroom_slots_player_idx on public.showroom_slots (player_id, exposed_at);

create table public.showroom_offers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  vehicle_id uuid not null unique references public.owned_vehicles(id) on delete cascade,
  amount bigint not null check (amount >= 1000),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null
);

create index showroom_offers_player_expires_idx
  on public.showroom_offers (player_id, expires_at);

alter table public.transactions drop constraint transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in (
  'vehicle_purchase', 'vehicle_sale', 'vehicle_repair',
  'property_acquisition', 'property_works', 'property_charges',
  'staff_hire', 'staff_salary'
));

create or replace function private.ensure_empire_state(p_player_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.empire_settings (player_id)
  values (p_player_id)
  on conflict (player_id) do nothing;
$$;

create or replace function private.has_grand_garage(p_player_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.owned_properties as property
    where property.player_id = p_player_id
      and property.template_id = 'grand-garage-autyco'
      and property.status = 'operational'
  );
$$;

create or replace function private.with_empire_state(p_player_id uuid, p_state jsonb)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select p_state || jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id::text,
        'role', employee.role,
        'hiredAt', (extract(epoch from employee.hired_at) * 1000)::bigint,
        'nextPayrollAt', (extract(epoch from employee.next_payroll_at) * 1000)::bigint,
        'status', employee.status,
        'pausedReason', employee.pause_reason,
        'salaryArrears', employee.salary_arrears
      ) order by employee.hired_at)
      from public.staff_members as employee
      where employee.player_id = p_player_id
    ), '[]'::jsonb),
    'mechanicJobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employeeId', job.employee_id::text,
        'vehicleId', job.vehicle_id::text,
        'stage', job.stage,
        'startedAt', (extract(epoch from job.started_at) * 1000)::bigint,
        'completesAt', (extract(epoch from job.completes_at) * 1000)::bigint
      ) order by job.started_at)
      from public.mechanic_jobs as job
      where job.player_id = p_player_id
    ), '[]'::jsonb),
    'commercialSettings', jsonb_build_object(
      'enabled', settings.commercial_enabled,
      'maxPurchasePrice', settings.commercial_max_purchase_price,
      'minDiscountPercent', settings.commercial_min_discount_percent,
      'marketProfile', settings.commercial_market_profile
    ),
    'nextCommercialActionAt',
      (extract(epoch from settings.next_commercial_action_at) * 1000)::bigint,
    'showroomVehicleIds', coalesce((
      select jsonb_agg(slot.vehicle_id::text order by slot.exposed_at)
      from public.showroom_slots as slot
      where slot.player_id = p_player_id
    ), '[]'::jsonb),
    'showroomOffers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', offer.id::text,
        'vehicleId', offer.vehicle_id::text,
        'amount', offer.amount,
        'createdAt', (extract(epoch from offer.created_at) * 1000)::bigint,
        'expiresAt', (extract(epoch from offer.expires_at) * 1000)::bigint
      ) order by offer.created_at)
      from public.showroom_offers as offer
      where offer.player_id = p_player_id
    ), '[]'::jsonb),
    'nextShowroomOfferAt',
      (extract(epoch from settings.next_showroom_offer_at) * 1000)::bigint
  )
  from private.empire_settings as settings
  where settings.player_id = p_player_id;
$$;

create or replace function private.advance_empire(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_employee public.staff_members%rowtype;
  v_job public.mechanic_jobs%rowtype;
  v_vehicle public.owned_vehicles%rowtype;
  v_listing public.market_listings%rowtype;
  v_settings private.empire_settings%rowtype;
  v_problem private.problem_templates%rowtype;
  v_cycles integer;
  v_due bigint;
  v_balance bigint;
  v_cost bigint;
  v_duration integer;
  v_problem_count integer;
  v_selected_count integer;
  v_offer bigint;
  v_entity_id uuid;
  v_attempt integer := 0;
begin
  perform private.ensure_empire_state(p_player_id);

  for v_employee in
    select * from public.staff_members
    where player_id = p_player_id and next_payroll_at <= v_now
    order by next_payroll_at, hired_at
    for update
  loop
    v_cycles := floor(extract(epoch from (v_now - v_employee.next_payroll_at)) / 86400)::integer + 1;
    v_due := v_employee.salary_per_cycle * v_cycles;
    select cash into v_balance from public.players where id = p_player_id for update;
    if v_balance >= v_due then
      update public.players set cash = cash - v_due
      where id = p_player_id returning cash into v_balance;
      update public.staff_members
      set next_payroll_at = next_payroll_at + interval '1 day' * v_cycles
      where id = v_employee.id;
      insert into public.transactions (player_id, kind, cash_delta, balance_after, metadata)
      values (p_player_id, 'staff_salary', -v_due, v_balance,
        jsonb_build_object('employeeId', v_employee.id, 'cycles', v_cycles));
      perform private.add_notification(p_player_id,
        'Salaire prélevé : ' || v_due || ' €.', 'neutral');
    else
      update public.staff_members
      set next_payroll_at = next_payroll_at + interval '1 day' * v_cycles,
        status = 'paused', pause_reason = 'payroll',
        salary_arrears = salary_arrears + v_due
      where id = v_employee.id;
      perform private.add_notification(p_player_id,
        'Paie insuffisante : ' || v_due
        || ' € placés en arriéré. Le poste est en pause, personne n’a été supprimé.',
        'warning');
    end if;
  end loop;

  for v_job in
    select * from public.mechanic_jobs
    where player_id = p_player_id and completes_at <= v_now
    order by completes_at
    for update
  loop
    select * into v_vehicle from public.owned_vehicles
    where id = v_job.vehicle_id and player_id = p_player_id and sold_at is null
    for update;

    if found and v_job.stage = 'diagnosis' and v_vehicle.status = 'needs-diagnosis' then
      v_problem_count := case v_vehicle.risk
        when 'low' then 1
        when 'medium' then 1 + floor(random() * 2)::integer
        else 2 + floor(random() * 2)::integer
      end;
      for v_problem in
        select problem.* from private.problem_templates as problem
        order by random() limit v_problem_count
      loop
        insert into public.vehicle_problems
          (vehicle_id, problem_id, label, detail, cost, duration_seconds, resale_impact)
        values (v_vehicle.id, v_problem.id, v_problem.label, v_problem.detail,
          v_problem.cost, v_problem.duration_seconds, v_problem.resale_impact)
        on conflict (vehicle_id, problem_id) do nothing;
      end loop;
      update public.owned_vehicles set status = 'needs-decision' where id = v_vehicle.id;
      perform private.add_notification(p_player_id,
        'Garagiste · diagnostic de la ' || v_vehicle.model || ' terminé.', 'neutral');
    elsif found and v_job.stage = 'listing' and v_vehicle.status = 'ready' and not v_vehicle.kept then
      v_offer := round((private.vehicle_resale_value(v_vehicle.id) * 0.98) / 100.0)::bigint * 100;
      update public.owned_vehicles
      set asking_price = v_offer,
        sale_chance = private.sale_chance(v_vehicle.id, v_offer),
        next_offer_at = v_now + make_interval(secs => floor(8 + random() * 7)::integer),
        status = 'listed'
      where id = v_vehicle.id;
      perform private.add_notification(p_player_id,
        'Garagiste · ' || v_vehicle.model || ' mise en vente automatiquement à '
        || v_offer || ' €.', 'neutral');
    end if;
    delete from public.mechanic_jobs where employee_id = v_job.employee_id;
  end loop;

  for v_employee in
    select employee.*
    from public.staff_members as employee
    where employee.player_id = p_player_id
      and employee.role = 'mechanic'
      and employee.status = 'active'
      and not exists (
        select 1 from public.mechanic_jobs as job where job.employee_id = employee.id
      )
    order by employee.hired_at
  loop
    select vehicle.* into v_vehicle
    from public.owned_vehicles as vehicle
    where vehicle.player_id = p_player_id
      and vehicle.sold_at is null
      and not vehicle.kept
      and vehicle.status in ('needs-diagnosis', 'needs-decision', 'ready')
      and not exists (
        select 1 from public.mechanic_jobs as job where job.vehicle_id = vehicle.id
      )
    order by vehicle.acquired_at
    limit 1
    for update;
    if not found then continue; end if;

    if v_vehicle.status = 'needs-diagnosis' then
      insert into public.mechanic_jobs
        (employee_id, player_id, vehicle_id, stage, started_at, completes_at)
      values (v_employee.id, p_player_id, v_vehicle.id, 'diagnosis', v_now,
        v_now + interval '18 seconds');
    elsif v_vehicle.status = 'needs-decision' then
      update public.vehicle_problems
      set selected_for_repair = severity = 'critical' or random() < 0.72
      where vehicle_id = v_vehicle.id and not repaired;
      select count(*)::integer into v_selected_count
      from public.vehicle_problems
      where vehicle_id = v_vehicle.id and not repaired and selected_for_repair;
      if v_selected_count = 0 then
        update public.vehicle_problems set selected_for_repair = true
        where id = (
          select id from public.vehicle_problems
          where vehicle_id = v_vehicle.id and not repaired order by created_at limit 1
        );
      end if;
      select coalesce(sum(cost), 0),
        ceil(least(18, greatest(6, round(coalesce(sum(duration_seconds), 0) * 0.72))) * 1.55)::integer
      into v_cost, v_duration
      from public.vehicle_problems
      where vehicle_id = v_vehicle.id and not repaired and selected_for_repair;
      select cash into v_balance from public.players where id = p_player_id for update;
      if v_cost > 0 and v_balance >= v_cost then
        update public.players set cash = cash - v_cost
        where id = p_player_id returning cash into v_balance;
        update public.owned_vehicles
        set repair_costs = repair_costs + v_cost,
          repairs_skipped = exists (
            select 1 from public.vehicle_problems
            where vehicle_id = v_vehicle.id and not repaired and not selected_for_repair
          ),
          repair_started_at = v_now,
          repair_completes_at = v_now + make_interval(secs => v_duration),
          status = 'repairing'
        where id = v_vehicle.id;
        insert into public.mechanic_jobs
          (employee_id, player_id, vehicle_id, stage, started_at, completes_at)
        values (v_employee.id, p_player_id, v_vehicle.id, 'repair', v_now,
          v_now + make_interval(secs => v_duration));
        insert into public.transactions
          (player_id, kind, cash_delta, balance_after, vehicle_id, metadata)
        values (p_player_id, 'vehicle_repair', -v_cost, v_balance, v_vehicle.id,
          jsonb_build_object('automatedBy', v_employee.id));
      else
        update public.vehicle_problems set selected_for_repair = false
        where vehicle_id = v_vehicle.id and not repaired;
      end if;
    else
      insert into public.mechanic_jobs
        (employee_id, player_id, vehicle_id, stage, started_at, completes_at)
      values (v_employee.id, p_player_id, v_vehicle.id, 'listing', v_now,
        v_now + interval '9 seconds');
    end if;
  end loop;

  delete from public.showroom_offers
  where player_id = p_player_id and expires_at <= v_now;
  delete from public.showroom_slots as slot
  where slot.player_id = p_player_id
    and not exists (
      select 1 from public.owned_vehicles as vehicle
      where vehicle.id = slot.vehicle_id and vehicle.player_id = p_player_id
        and vehicle.sold_at is null and vehicle.kept
    );

  select * into v_settings from private.empire_settings
  where player_id = p_player_id for update;

  if v_settings.next_showroom_offer_at <= v_now then
    select vehicle.* into v_vehicle
    from public.showroom_slots as slot
    join public.owned_vehicles as vehicle on vehicle.id = slot.vehicle_id
    where slot.player_id = p_player_id
      and not exists (
        select 1 from public.showroom_offers as offer where offer.vehicle_id = slot.vehicle_id
      )
    order by random() limit 1;
    if found then
      v_offer := round((private.vehicle_resale_value(v_vehicle.id)
        * (0.92 + random() * 0.21)) / 100.0)::bigint * 100;
      insert into public.showroom_offers
        (player_id, vehicle_id, amount, created_at, expires_at)
      values (p_player_id, v_vehicle.id, v_offer, v_now, v_now + interval '20 minutes');
      perform private.add_notification(p_player_id,
        'Visiteur showroom · ' || v_offer || ' € proposés pour la '
        || v_vehicle.model || '.', 'success');
    end if;
    update private.empire_settings
    set next_showroom_offer_at = v_now
      + make_interval(secs => floor(720 + random() * 481)::integer)
    where player_id = p_player_id;
  end if;

  select * into v_settings from private.empire_settings
  where player_id = p_player_id for update;
  if v_settings.commercial_enabled
    and v_settings.next_commercial_action_at <= v_now
    and exists (
      select 1 from public.staff_members
      where player_id = p_player_id and role = 'salesperson' and status = 'active'
    ) then
    loop
      exit when v_attempt >= 12 or v_settings.next_commercial_action_at > v_now;
      v_attempt := v_attempt + 1;
      select listing.* into v_listing
      from public.market_listings as listing
      join public.players as player on player.id = listing.player_id
      where listing.player_id = p_player_id
        and listing.market_tier in ('standard', 'premium')
        and (v_settings.commercial_market_profile = 'both'
          or listing.market_tier = v_settings.commercial_market_profile)
        and listing.asking_price <= v_settings.commercial_max_purchase_price
        and ((listing.market_value - listing.asking_price) * 100.0 / listing.market_value)
          >= v_settings.commercial_min_discount_percent
        and listing.asking_price <= player.cash
      order by (listing.market_value - listing.asking_price) desc
      limit 1 for update of listing;
      if found and (
        select count(*) from public.owned_vehicles
        where player_id = p_player_id and sold_at is null
      ) < private.garage_capacity(p_player_id) then
        insert into public.owned_vehicles (
          player_id, original_listing_id, template_id, maker, model, segment, year,
          mileage, purchase_price, market_value, risk, status
        ) values (
          p_player_id, v_listing.id, v_listing.template_id, v_listing.maker,
          v_listing.model, v_listing.segment, v_listing.year, v_listing.mileage,
          v_listing.asking_price, v_listing.market_value, v_listing.risk, 'needs-diagnosis'
        ) returning id into v_entity_id;
        update public.players set cash = cash - v_listing.asking_price
        where id = p_player_id returning cash into v_balance;
        delete from public.market_listings where id = v_listing.id;
        insert into public.transactions
          (player_id, kind, cash_delta, balance_after, vehicle_id, metadata)
        values (p_player_id, 'vehicle_purchase', -v_listing.asking_price, v_balance, v_entity_id,
          jsonb_build_object('listingId', v_listing.id, 'automatedBy', 'salesperson'));
        perform private.add_notification(p_player_id,
          'Commercial · ' || v_listing.model || ' achetée automatiquement à '
          || v_listing.asking_price || ' €.', 'success');
      end if;
      v_settings.next_commercial_action_at := v_settings.next_commercial_action_at
        + make_interval(secs => floor(45 + random() * 31)::integer);
      exit when not found;
    end loop;
    if v_settings.next_commercial_action_at <= v_now then
      v_settings.next_commercial_action_at := v_now
        + make_interval(secs => floor(45 + random() * 31)::integer);
    end if;
    update private.empire_settings
    set next_commercial_action_at = v_settings.next_commercial_action_at
    where player_id = p_player_id;
  end if;
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
  perform private.ensure_empire_state(v_player_id);
  perform private.advance_game(v_player_id);
  perform private.advance_empire(v_player_id);
  return private.with_empire_state(
    v_player_id,
    private.with_market_state(v_player_id, private.build_game_state(v_player_id))
  );
end;
$$;

create or replace function private.perform_empire_action(
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
  v_employee public.staff_members%rowtype;
  v_vehicle public.owned_vehicles%rowtype;
  v_showroom_offer public.showroom_offers%rowtype;
  v_role text;
  v_cost bigint;
  v_limit integer;
  v_balance bigint;
  v_profit bigint;
  v_entity_id uuid;
  v_settings_payload jsonb;
begin
  if v_player_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Identifiant de requête requis.' using errcode = '22023';
  end if;

  select receipt.state_snapshot into v_state
  from private.action_receipts as receipt
  where receipt.player_id = v_player_id and receipt.request_id = p_request_id;
  if found then return v_state; end if;

  perform private.ensure_player(v_player_id);
  perform private.ensure_empire_state(v_player_id);
  perform private.advance_game(v_player_id);
  perform private.advance_empire(v_player_id);
  p_payload := coalesce(p_payload, '{}'::jsonb);

  if p_action in (
    'DIAGNOSE_VEHICLE', 'START_REPAIR', 'SKIP_REPAIR',
    'LIST_VEHICLE', 'TOGGLE_VEHICLE_KEPT'
  ) then
    delete from public.mechanic_jobs
    where player_id = v_player_id and vehicle_id = (p_payload ->> 'vehicleId')::uuid;
  end if;

  if p_action = 'HIRE_STAFF' then
    if not private.has_grand_garage(v_player_id) then
      raise exception 'Le Grand Garage doit être opérationnel avant toute embauche.' using errcode = 'P0001';
    end if;
    v_role := p_payload ->> 'role';
    if v_role = 'mechanic' then v_cost := 110000; v_limit := 2;
    elsif v_role = 'salesperson' then v_cost := 160000; v_limit := 1;
    else raise exception 'Poste inconnu.' using errcode = '22023';
    end if;
    if (select count(*) from public.staff_members
      where player_id = v_player_id and role = v_role) >= v_limit then
      raise exception 'Le plafond de ce poste est déjà atteint.' using errcode = 'P0001';
    end if;
    select cash into v_balance from public.players where id = v_player_id for update;
    if v_balance < v_cost then
      raise exception 'Trésorerie insuffisante pour cette embauche.' using errcode = 'P0001';
    end if;
    update public.players set cash = cash - v_cost
    where id = v_player_id returning cash into v_balance;
    insert into public.staff_members (player_id, role, salary_per_cycle)
    values (v_player_id, v_role, case when v_role = 'mechanic' then 9000 else 12000 end);
    insert into public.transactions (player_id, kind, cash_delta, balance_after, metadata)
    values (v_player_id, 'staff_hire', -v_cost, v_balance, jsonb_build_object('role', v_role));
    if v_role = 'salesperson' then
      update private.empire_settings
      set next_commercial_action_at = clock_timestamp() + interval '45 seconds'
      where player_id = v_player_id;
    end if;
    perform private.add_notification(v_player_id,
      case when v_role = 'mechanic'
        then 'Garagiste recruté. Il prend en charge le stock actif en continu.'
        else 'Commercial recruté. Son premier repérage du Marché est programmé.'
      end, 'success');

  elsif p_action = 'TOGGLE_STAFF_STATUS' then
    v_entity_id := (p_payload ->> 'employeeId')::uuid;
    select * into v_employee from public.staff_members
    where id = v_entity_id and player_id = v_player_id for update;
    if not found then raise exception 'Employé introuvable.' using errcode = 'P0001'; end if;
    if v_employee.pause_reason = 'payroll' and v_employee.salary_arrears > 0 then
      raise exception 'Règle d’abord les salaires en retard.' using errcode = 'P0001';
    end if;
    update public.staff_members
    set status = case when status = 'active' then 'paused' else 'active' end,
      pause_reason = case when status = 'active' then 'manual' else null end
    where id = v_employee.id;

  elsif p_action = 'PAY_STAFF_ARREARS' then
    v_entity_id := (p_payload ->> 'employeeId')::uuid;
    select * into v_employee from public.staff_members
    where id = v_entity_id and player_id = v_player_id for update;
    if not found or v_employee.salary_arrears <= 0 then
      raise exception 'Aucun arriéré à régler.' using errcode = 'P0001';
    end if;
    select cash into v_balance from public.players where id = v_player_id for update;
    if v_balance < v_employee.salary_arrears then
      raise exception 'Trésorerie insuffisante pour solder les salaires.' using errcode = 'P0001';
    end if;
    update public.players set cash = cash - v_employee.salary_arrears
    where id = v_player_id returning cash into v_balance;
    update public.staff_members
    set salary_arrears = 0, status = 'active', pause_reason = null
    where id = v_employee.id;
    insert into public.transactions (player_id, kind, cash_delta, balance_after, metadata)
    values (v_player_id, 'staff_salary', -v_employee.salary_arrears, v_balance,
      jsonb_build_object('employeeId', v_employee.id, 'arrears', true));

  elsif p_action = 'UPDATE_COMMERCIAL_SETTINGS' then
    v_settings_payload := p_payload -> 'settings';
    if jsonb_typeof(v_settings_payload) <> 'object' then
      raise exception 'Consigne commerciale invalide.' using errcode = '22023';
    end if;
    update private.empire_settings set
      commercial_enabled = coalesce((v_settings_payload ->> 'enabled')::boolean, true),
      commercial_max_purchase_price = greatest(5000, least(100000,
        round((v_settings_payload ->> 'maxPurchasePrice')::numeric / 500.0)::bigint * 500)),
      commercial_min_discount_percent = greatest(5, least(35,
        round((v_settings_payload ->> 'minDiscountPercent')::numeric)::integer)),
      commercial_market_profile = case
        when v_settings_payload ->> 'marketProfile' in ('standard', 'premium', 'both')
          then v_settings_payload ->> 'marketProfile'
        else 'both' end
    where player_id = v_player_id;

  elsif p_action = 'TOGGLE_SHOWROOM_VEHICLE' then
    if not private.has_grand_garage(v_player_id) then
      raise exception 'Grand Garage requis.' using errcode = 'P0001';
    end if;
    v_entity_id := (p_payload ->> 'vehicleId')::uuid;
    if exists (select 1 from public.showroom_slots
      where player_id = v_player_id and vehicle_id = v_entity_id) then
      delete from public.showroom_offers
      where player_id = v_player_id and vehicle_id = v_entity_id;
      delete from public.showroom_slots
      where player_id = v_player_id and vehicle_id = v_entity_id;
    else
      select * into v_vehicle from public.owned_vehicles
      where id = v_entity_id and player_id = v_player_id and sold_at is null and kept;
      if not found then
        raise exception 'Seule la collection peut entrer au showroom.' using errcode = 'P0001';
      end if;
      if (select count(*) from public.showroom_slots where player_id = v_player_id) >= 4 then
        raise exception 'Le showroom est limité à quatre véhicules.' using errcode = 'P0001';
      end if;
      insert into public.showroom_slots (player_id, vehicle_id)
      values (v_player_id, v_entity_id);
    end if;

  elsif p_action = 'ACCEPT_SHOWROOM_OFFER' then
    v_entity_id := (p_payload ->> 'offerId')::uuid;
    select * into v_showroom_offer from public.showroom_offers
    where id = v_entity_id and player_id = v_player_id and expires_at > clock_timestamp()
    for update;
    if not found then raise exception 'Cette proposition a expiré.' using errcode = 'P0001'; end if;
    select * into v_vehicle from public.owned_vehicles
    where id = v_showroom_offer.vehicle_id and player_id = v_player_id
      and sold_at is null and kept for update;
    if not found then raise exception 'Véhicule indisponible.' using errcode = 'P0001'; end if;
    v_profit := v_showroom_offer.amount - v_vehicle.purchase_price - v_vehicle.repair_costs;
    update public.players
    set cash = cash + v_showroom_offer.amount, profit_today = profit_today + v_profit
    where id = v_player_id returning cash into v_balance;
    update public.owned_vehicles
    set status = 'sold', sold_at = clock_timestamp(), sale_price = v_showroom_offer.amount,
      next_offer_at = null
    where id = v_vehicle.id;
    delete from public.showroom_offers where id = v_showroom_offer.id;
    delete from public.showroom_slots where vehicle_id = v_vehicle.id;
    insert into public.transactions
      (player_id, kind, cash_delta, balance_after, vehicle_id, metadata)
    values (v_player_id, 'vehicle_sale', v_showroom_offer.amount, v_balance, v_vehicle.id,
      jsonb_build_object('profit', v_profit, 'channel', 'showroom'));
    perform private.add_notification(v_player_id,
      v_vehicle.model || ' cédée à un visiteur : +' || v_showroom_offer.amount || ' €.',
      case when v_profit >= 0 then 'success' else 'warning' end);

  elsif p_action = 'REJECT_SHOWROOM_OFFER' then
    v_entity_id := (p_payload ->> 'offerId')::uuid;
    delete from public.showroom_offers
    where id = v_entity_id and player_id = v_player_id;
    update private.empire_settings
    set next_showroom_offer_at = least(next_showroom_offer_at,
      clock_timestamp() + interval '6 minutes')
    where player_id = v_player_id;

  else
    v_state := private.perform_game_action_with_market(p_action, p_payload, p_request_id);
    if p_action = 'TOGGLE_VEHICLE_KEPT' then
      delete from public.showroom_offers as offer
      where offer.player_id = v_player_id and offer.vehicle_id = (p_payload ->> 'vehicleId')::uuid
        and not exists (
          select 1 from public.owned_vehicles as vehicle
          where vehicle.id = offer.vehicle_id and vehicle.kept and vehicle.sold_at is null
        );
      delete from public.showroom_slots as slot
      where slot.player_id = v_player_id and slot.vehicle_id = (p_payload ->> 'vehicleId')::uuid
        and not exists (
          select 1 from public.owned_vehicles as vehicle
          where vehicle.id = slot.vehicle_id and vehicle.kept and vehicle.sold_at is null
        );
    end if;
    v_state := private.with_empire_state(v_player_id, v_state);
    update private.action_receipts set state_snapshot = v_state
    where player_id = v_player_id and request_id = p_request_id;
    return v_state;
  end if;

  perform private.ensure_market_listings(v_player_id, 10);
  v_state := private.with_empire_state(
    v_player_id,
    private.with_market_state(v_player_id, private.build_game_state(v_player_id))
  );
  insert into private.action_receipts (player_id, request_id, action, state_snapshot)
  values (v_player_id, p_request_id, p_action, v_state);
  return v_state;
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
  return private.perform_empire_action(p_action, p_payload, p_request_id);
end;
$$;

alter table public.staff_members enable row level security;
alter table public.mechanic_jobs enable row level security;
alter table public.showroom_slots enable row level security;
alter table public.showroom_offers enable row level security;

create policy staff_members_select_own on public.staff_members
  for select to authenticated using (player_id = (select auth.uid()));
create policy mechanic_jobs_select_own on public.mechanic_jobs
  for select to authenticated using (player_id = (select auth.uid()));
create policy showroom_slots_select_own on public.showroom_slots
  for select to authenticated using (player_id = (select auth.uid()));
create policy showroom_offers_select_own on public.showroom_offers
  for select to authenticated using (player_id = (select auth.uid()));

revoke all on public.staff_members, public.mechanic_jobs,
  public.showroom_slots, public.showroom_offers from anon, authenticated;
grant select on public.staff_members, public.mechanic_jobs,
  public.showroom_slots, public.showroom_offers to authenticated;

revoke execute on function private.ensure_empire_state(uuid) from public, anon, authenticated;
revoke execute on function private.has_grand_garage(uuid) from public, anon, authenticated;
revoke execute on function private.with_empire_state(uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.advance_empire(uuid) from public, anon, authenticated;
revoke execute on function private.perform_empire_action(text, jsonb, uuid)
  from public, anon;
grant execute on function private.perform_empire_action(text, jsonb, uuid) to authenticated;

comment on function private.advance_empire(uuid) is
  'Paie hors ligne, automatisation des garagistes/commerciaux et offres showroom. Le filtre commercial exclut collector côté serveur.';

commit;

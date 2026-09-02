begin;

alter table private.problem_templates
  add column severity text;

update private.problem_templates
set severity = case
  when id in ('brakes', 'tires', 'timing') then 'critical'
  else 'minor'
end;

alter table private.problem_templates
  alter column severity set not null,
  add constraint problem_templates_severity_check
    check (severity in ('critical', 'minor'));

alter table public.vehicle_problems
  add column severity text,
  add column selected_for_repair boolean not null default false;

update public.vehicle_problems as problem
set severity = template.severity
from private.problem_templates as template
where template.id = problem.problem_id;

update public.vehicle_problems as problem
set selected_for_repair = true
from public.owned_vehicles as vehicle
where vehicle.id = problem.vehicle_id
  and vehicle.status = 'repairing'
  and not problem.repaired;

alter table public.vehicle_problems
  alter column severity set not null,
  add constraint vehicle_problems_severity_check
    check (severity in ('critical', 'minor'));

create or replace function private.snapshot_problem_severity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select template.severity
  into new.severity
  from private.problem_templates as template
  where template.id = new.problem_id;

  if new.severity is null then
    raise exception 'Gravité inconnue pour le problème %.', new.problem_id using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger vehicle_problems_snapshot_severity
before insert or update of problem_id on public.vehicle_problems
for each row execute function private.snapshot_problem_severity();

create or replace function private.vehicle_resale_value(p_vehicle_id uuid)
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  with valuation as (
    select
      vehicle.market_value,
      round((vehicle.market_value - coalesce(sum(problem.resale_impact)
        filter (where not problem.repaired), 0)) / 100.0)::bigint * 100 as proportional_value,
      count(problem.id) filter (
        where not problem.repaired and problem.severity = 'critical'
      ) > 0 as has_critical_problem
    from public.owned_vehicles as vehicle
    left join public.vehicle_problems as problem on problem.vehicle_id = vehicle.id
    where vehicle.id = p_vehicle_id
    group by vehicle.id, vehicle.market_value
  )
  select greatest(
    1000::bigint,
    case
      when valuation.has_critical_problem then least(
        valuation.proportional_value,
        round((valuation.market_value * 0.55) / 100.0)::bigint * 100
      )
      else valuation.proportional_value
    end
  )
  from valuation;
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
  v_completed_count integer;
  v_remaining_count integer;
begin
  update public.players
  set profit_today = 0, profit_day_key = current_date
  where id = p_player_id and profit_day_key <> current_date;

  for v_vehicle in
    update public.owned_vehicles
    set status = 'ready', repair_started_at = null, repair_completes_at = null
    where player_id = p_player_id
      and status = 'repairing'
      and repair_completes_at <= v_now
    returning *
  loop
    select count(*)::integer
    into v_completed_count
    from public.vehicle_problems
    where vehicle_id = v_vehicle.id and selected_for_repair;

    update public.vehicle_problems
    set repaired = true, selected_for_repair = false
    where vehicle_id = v_vehicle.id and selected_for_repair;

    select count(*)::integer
    into v_remaining_count
    from public.vehicle_problems
    where vehicle_id = v_vehicle.id and not repaired;

    perform private.add_notification(
      p_player_id,
      case
        when v_remaining_count > 0 then
          v_completed_count || case when v_completed_count > 1
            then ' interventions terminées sur la '
            else ' intervention terminée sur la '
          end || v_vehicle.model || ' · ' || v_remaining_count || ' défaut(s) restant(s).'
        else v_vehicle.model || ' réparée. Elle peut maintenant être mise en vente.'
      end,
      case when v_remaining_count > 0 then 'neutral' else 'success' end
    );
    perform private.record_event(
      p_player_id,
      'vehicle_repair_completed',
      jsonb_build_object(
        'vehicleId', v_vehicle.id,
        'completedCount', v_completed_count,
        'remainingCount', v_remaining_count
      )
    );
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
            'severity', problem.severity,
            'cost', problem.cost,
            'durationSeconds', problem.duration_seconds,
            'resaleImpact', problem.resale_impact,
            'repaired', problem.repaired,
            'selectedForRepair', problem.selected_for_repair
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

create or replace function private.perform_selected_repair(
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
  v_vehicle public.owned_vehicles%rowtype;
  v_entity_id uuid;
  v_problem_ids text[];
  v_valid_count integer;
  v_cost bigint;
  v_duration integer;
  v_balance bigint;
  v_remaining_count integer;
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
  v_entity_id := (p_payload ->> 'vehicleId')::uuid;

  select * into v_vehicle
  from public.owned_vehicles
  where id = v_entity_id and player_id = v_player_id and sold_at is null
  for update;
  if not found or v_vehicle.status <> 'needs-decision' then
    raise exception 'Ces réparations ne peuvent pas être lancées.' using errcode = 'P0001';
  end if;

  if p_payload ? 'problemIds' then
    if jsonb_typeof(p_payload -> 'problemIds') is distinct from 'array' then
      raise exception 'Sélection de réparations invalide.' using errcode = '22023';
    end if;
    select array_agg(distinct selected.problem_id)
    into v_problem_ids
    from jsonb_array_elements_text(p_payload -> 'problemIds') as selected(problem_id);
  else
    select array_agg(problem.problem_id)
    into v_problem_ids
    from public.vehicle_problems as problem
    where problem.vehicle_id = v_vehicle.id and not problem.repaired;
  end if;

  if coalesce(cardinality(v_problem_ids), 0) = 0 then
    raise exception 'Sélectionne au moins un poste à réparer.' using errcode = 'P0001';
  end if;

  select count(*)::integer,
    coalesce(sum(problem.cost), 0),
    least(18, greatest(6, round(coalesce(sum(problem.duration_seconds), 0) * 0.72)))::integer
  into v_valid_count, v_cost, v_duration
  from public.vehicle_problems as problem
  where problem.vehicle_id = v_vehicle.id
    and not problem.repaired
    and problem.problem_id = any(v_problem_ids);

  if v_valid_count <> cardinality(v_problem_ids) or v_cost <= 0 then
    raise exception 'La sélection contient un poste indisponible.' using errcode = 'P0001';
  end if;

  select cash into v_balance from public.players where id = v_player_id for update;
  if v_balance < v_cost then
    raise exception 'Trésorerie insuffisante pour lancer les réparations.' using errcode = 'P0001';
  end if;

  update public.vehicle_problems
  set selected_for_repair = problem_id = any(v_problem_ids)
  where vehicle_id = v_vehicle.id and not repaired;

  select count(*)::integer
  into v_remaining_count
  from public.vehicle_problems
  where vehicle_id = v_vehicle.id and not repaired and not selected_for_repair;

  update public.players
  set cash = cash - v_cost
  where id = v_player_id
  returning cash into v_balance;

  update public.owned_vehicles
  set repair_costs = repair_costs + v_cost,
    repairs_skipped = v_remaining_count > 0,
    repair_started_at = clock_timestamp(),
    repair_completes_at = clock_timestamp() + make_interval(secs => v_duration),
    status = 'repairing'
  where id = v_vehicle.id;

  insert into public.transactions
    (player_id, kind, cash_delta, balance_after, vehicle_id, metadata)
  values (
    v_player_id,
    'vehicle_repair',
    -v_cost,
    v_balance,
    v_vehicle.id,
    jsonb_build_object('problemIds', to_jsonb(v_problem_ids))
  );
  perform private.record_event(
    v_player_id,
    'vehicle_repair_started',
    jsonb_build_object('vehicleId', v_vehicle.id, 'cost', v_cost, 'problemIds', to_jsonb(v_problem_ids))
  );
  perform private.add_notification(
    v_player_id,
    v_valid_count || case when v_valid_count > 1 then ' interventions lancées sur la ' else ' intervention lancée sur la ' end || v_vehicle.model || '.',
    'neutral'
  );

  perform private.ensure_market_listings(v_player_id, 10);
  v_state := private.build_game_state(v_player_id);
  insert into private.action_receipts (player_id, request_id, action, state_snapshot)
  values (v_player_id, p_request_id, 'START_REPAIR', v_state);
  delete from private.action_receipts
  where player_id = v_player_id
    and created_at < clock_timestamp() - interval '30 days';
  return v_state;
end;
$$;

create or replace function private.enforce_critical_sale_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_maximum_price bigint;
begin
  if new.status = 'listed' and exists (
    select 1
    from public.vehicle_problems as problem
    where problem.vehicle_id = new.id
      and not problem.repaired
      and problem.severity = 'critical'
  ) then
    v_maximum_price := private.vehicle_resale_value(new.id);
    if new.asking_price > v_maximum_price then
      raise exception 'Prix plafonné à % € tant qu’une grosse panne reste ouverte.', v_maximum_price
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger owned_vehicles_critical_sale_cap
before update of asking_price, status on public.owned_vehicles
for each row execute function private.enforce_critical_sale_cap();

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

revoke execute on function private.snapshot_problem_severity() from public, anon, authenticated;
revoke execute on function private.enforce_critical_sale_cap() from public, anon, authenticated;
revoke execute on function private.perform_selected_repair(jsonb, uuid) from public, anon;
grant execute on function private.perform_selected_repair(jsonb, uuid) to authenticated;

comment on column private.problem_templates.severity is
  'Gravité métier : critical plafonne la revente, minor applique uniquement resale_impact.';
comment on column public.vehicle_problems.selected_for_repair is
  'Poste inclus dans l’intervention atelier actuellement en cours.';

commit;

begin;

do $$
begin
  if exists (select 1 from public.owned_properties where template_id = 'grand-garage-autyco')
    or exists (select 1 from public.staff_members)
    or exists (select 1 from public.showroom_slots)
    or exists (select 1 from public.showroom_offers) then
    raise exception using
      errcode = 'P0001',
      message = 'Rollback Empire refusé : un joueur possède déjà le Grand Garage, du staff ou une exposition. Préparer une migration corrective sans perte de progression.';
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
  perform private.advance_game(v_player_id);
  return private.with_market_state(v_player_id, private.build_game_state(v_player_id));
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

delete from private.action_receipts
where action in (
  'HIRE_STAFF', 'TOGGLE_STAFF_STATUS', 'PAY_STAFF_ARREARS',
  'UPDATE_COMMERCIAL_SETTINGS', 'TOGGLE_SHOWROOM_VEHICLE',
  'ACCEPT_SHOWROOM_OFFER', 'REJECT_SHOWROOM_OFFER'
);

drop function private.perform_empire_action(text, jsonb, uuid);
drop function private.advance_empire(uuid);
drop function private.with_empire_state(uuid, jsonb);
drop function private.has_grand_garage(uuid);
drop function private.ensure_empire_state(uuid);

drop table public.showroom_offers;
drop table public.showroom_slots;
drop table public.mechanic_jobs;
drop table public.staff_members;
drop table private.empire_settings;

alter table public.transactions drop constraint transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in (
  'vehicle_purchase', 'vehicle_sale', 'vehicle_repair',
  'property_acquisition', 'property_works', 'property_charges'
));

delete from private.property_templates where id = 'grand-garage-autyco';

commit;

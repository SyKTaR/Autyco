begin;

do $$
begin
  if exists (
    select 1
    from public.owned_vehicles
    where template_id in (
      '308-ii', 'corsa-f', 'qashqai-ii', 'i30-iii',
      'classe-a-w176', 'volvo-v40', 'lexus-ct-200h', 'abarth-595-competizione',
      'mercedes-190e-23-16', 'honda-nsx-na1', 'skyline-gtr-r32', 'lotus-esprit-v8'
    )
  ) then
    raise exception 'Rollback refusé : un véhicule du catalogue étendu existe dans l’historique joueur.';
  end if;
end;
$$;

delete from public.market_listings
where template_id in (
  '308-ii', 'corsa-f', 'qashqai-ii', 'i30-iii',
  'classe-a-w176', 'volvo-v40', 'lexus-ct-200h', 'abarth-595-competizione',
  'mercedes-190e-23-16', 'honda-nsx-na1', 'skyline-gtr-r32', 'lotus-esprit-v8'
);

delete from private.vehicle_templates
where id in (
  '308-ii', 'corsa-f', 'qashqai-ii', 'i30-iii',
  'classe-a-w176', 'volvo-v40', 'lexus-ct-200h', 'abarth-595-competizione',
  'mercedes-190e-23-16', 'honda-nsx-na1', 'skyline-gtr-r32', 'lotus-esprit-v8'
);

commit;

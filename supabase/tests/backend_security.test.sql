begin;

select plan(28);

select has_table('public', 'players', 'players existe');
select has_table('public', 'market_listings', 'market_listings existe');
select has_table('public', 'owned_vehicles', 'owned_vehicles existe');
select has_table('public', 'vehicle_problems', 'vehicle_problems existe');
select has_table('public', 'owned_properties', 'owned_properties existe');
select has_table('public', 'transactions', 'transactions existe');
select has_table('public', 'game_events', 'game_events existe');
select has_table('public', 'notifications', 'notifications existe');
select has_column(
  'public',
  'vehicle_problems',
  'severity',
  'la gravité est persistée sur chaque problème diagnostiqué'
);
select has_column(
  'private',
  'vehicle_templates',
  'market_tier',
  'la gamme appartient au modèle source'
);
select has_column(
  'public',
  'market_listings',
  'market_tier',
  'la gamme est figée sur chaque annonce'
);
select has_column('public', 'players', 'market_standard_refresh_at', 'la rotation Occasion est persistée');
select has_column('public', 'players', 'market_premium_refresh_at', 'la rotation Premium est persistée');
select has_column('public', 'players', 'market_collector_refresh_at', 'la rotation Collection est persistée');
select has_column(
  'public',
  'vehicle_problems',
  'selected_for_repair',
  'la sélection atelier est persistée pendant les travaux'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'players', 'market_listings', 'owned_vehicles', 'vehicle_problems',
        'owned_properties', 'transactions', 'game_events', 'notifications'
      )
      and relation.relrowsecurity
  ),
  8,
  'RLS est actif sur les huit tables exposées'
);

select ok(
  not exists (
    select 1
    from unnest(array['anon', 'authenticated']) as role_name
    cross join unnest(array[
      'public.players', 'public.market_listings', 'public.owned_vehicles',
      'public.vehicle_problems', 'public.owned_properties', 'public.transactions',
      'public.game_events', 'public.notifications'
    ]) as relation_name
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as privilege_name
    where has_table_privilege(role_name, relation_name, privilege_name)
  ),
  'anon et authenticated ne peuvent pas muter directement les tables de jeu'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.players', 'public.market_listings', 'public.owned_vehicles',
      'public.vehicle_problems', 'public.owned_properties', 'public.transactions',
      'public.game_events', 'public.notifications'
    ]) as relation_name
    where has_table_privilege('anon', relation_name, 'SELECT')
  ),
  'anon ne peut lire aucune donnée de jeu'
);

select ok(
  not (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public' and routine.proname = 'get_game_state'
  ),
  'get_game_state public reste SECURITY INVOKER'
);

select ok(
  not (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public' and routine.proname = 'game_action'
  ),
  'game_action public reste SECURITY INVOKER'
);

select ok(
  (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private' and routine.proname = 'load_my_game_state'
  ),
  'le chargement privilégié est confiné au schéma private'
);

select ok(
  (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private' and routine.proname = 'perform_game_action'
  ),
  'la mutation privilégiée est confinée au schéma private'
);

select ok(
  (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private' and routine.proname = 'perform_tiered_market_action'
  ),
  'la mutation des marchés par gamme reste confinée au schéma private'
);

select ok(
  has_function_privilege(
    'authenticated',
    'private.perform_game_action_with_market(text,jsonb,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'private.perform_game_action_with_market(text,jsonb,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.with_market_state(uuid,jsonb)',
    'EXECUTE'
  ),
  'seul le point d’entrée marché authentifié expose l’enrichissement de l’état'
);

select ok(
  (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private' and routine.proname = 'perform_selected_repair'
  ),
  'la réparation sélective privilégiée est confinée au schéma private'
);

select ok(
  has_function_privilege(
    'authenticated',
    'private.perform_selected_repair(jsonb,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'private.perform_selected_repair(jsonb,uuid)',
    'EXECUTE'
  ),
  'seul authenticated peut appeler le moteur privé de réparation sélective'
);

select ok(
  has_function_privilege('authenticated', 'public.get_game_state()', 'EXECUTE')
  and has_function_privilege(
    'authenticated',
    'public.game_action(text,jsonb,uuid)',
    'EXECUTE'
  ),
  'authenticated peut appeler les deux RPC publiques'
);

select ok(
  not has_function_privilege('anon', 'public.get_game_state()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.game_action(text,jsonb,uuid)', 'EXECUTE'),
  'anon ne peut appeler aucune RPC de jeu'
);

select * from finish();
rollback;

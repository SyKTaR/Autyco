begin;

select plan(28);

select has_table('public', 'private_servers', 'private_servers existe');
select has_table('public', 'private_server_memberships', 'private_server_memberships existe');
select has_table('private', 'private_server_invites', 'les invitations restent privées');
select has_table('private', 'private_server_join_attempts', 'les tentatives sont suivies côté serveur');

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('private_servers', 'private_server_memberships')
      and relation.relrowsecurity
  ),
  2,
  'RLS est active sur les deux tables multijoueurs exposées'
);

select ok(
  not exists (
    select 1
    from unnest(array['anon', 'authenticated']) as role_name
    cross join unnest(array[
      'public.private_servers',
      'public.private_server_memberships'
    ]) as relation_name
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as privilege_name
    where has_table_privilege(role_name, relation_name, privilege_name)
  ),
  'aucun rôle client ne peut muter directement les serveurs ou appartenances'
);

select ok(
  not has_table_privilege('anon', 'public.private_servers', 'SELECT')
  and not has_table_privilege('anon', 'public.private_server_memberships', 'SELECT'),
  'anon ne peut lire aucune table multijoueur'
);

select ok(
  not has_table_privilege('authenticated', 'private.private_server_invites', 'SELECT')
  and not has_table_privilege('authenticated', 'private.private_server_join_attempts', 'SELECT'),
  'authenticated ne peut lire ni les hash ni les compteurs de tentatives'
);

select col_is_pk(
  'public',
  'private_server_memberships',
  'player_id',
  'la clé primaire garantit un seul serveur actif par joueur'
);

select col_type_is(
  'private',
  'private_server_invites',
  'code_hash',
  'bytea',
  'le code est stocké sous forme de hash binaire'
);

select ok(
  (
    select count(*) = 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'private_server_invites'
      and constraint_row.contype = 'u'
  ),
  'les hash d’invitation sont uniques'
);

select ok(
  (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and routine.proname = 'get_private_server_leaderboard'
  ),
  'le classement privilégié est SECURITY DEFINER dans private'
);

select ok(
  not (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname = 'get_private_server_leaderboard'
  ),
  'la RPC publique du classement reste SECURITY INVOKER'
);

select ok(
  has_function_privilege('authenticated', 'public.create_private_server(text,boolean)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_current_private_server()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.rotate_private_server_invite()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.join_private_server(text,boolean)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.leave_private_server()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_private_server_leaderboard()', 'EXECUTE'),
  'authenticated peut appeler les six RPC publiques du MVP'
);

select ok(
  not has_function_privilege('anon', 'public.create_private_server(text,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_current_private_server()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rotate_private_server_invite()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.join_private_server(text,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.leave_private_server()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_private_server_leaderboard()', 'EXECUTE'),
  'anon sans session ne peut appeler aucune RPC multijoueur'
);

-- Matrice d’isolation réelle : A et B partagent le serveur 1, C est seul sur le
-- serveur 2, D n’a aucun serveur. Ces lignes sont entièrement annulées en fin de test.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '{}', '{"garage_name":"Garage A","player_name":"Joueur A"}', clock_timestamp(), clock_timestamp(), true),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '{}', '{"garage_name":"Garage B","player_name":"Joueur B"}', clock_timestamp(), clock_timestamp(), true),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '{}', '{"garage_name":"Garage C","player_name":"Joueur C"}', clock_timestamp(), clock_timestamp(), true),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', '{}', '{"garage_name":"Garage D","player_name":"Joueur D"}', clock_timestamp(), clock_timestamp(), true);

update public.players
set cash = case id
  when '10000000-0000-0000-0000-000000000001' then 40000
  when '10000000-0000-0000-0000-000000000002' then 30000
  when '10000000-0000-0000-0000-000000000003' then 90000
  else 20000
end;

insert into public.private_servers (id, name, owner_player_id) values
  ('20000000-0000-0000-0000-000000000001', 'Serveur partagé A B', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Serveur isolé C', '10000000-0000-0000-0000-000000000003');

insert into public.private_server_memberships (player_id, server_id) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.private_servers),
  1::bigint,
  'A voit uniquement son serveur, jamais celui de C'
);

select is(
  (select count(*) from public.private_server_memberships),
  2::bigint,
  'A voit uniquement les appartenances A et B de son serveur commun'
);

select is(
  (select count(*) from public.players),
  1::bigint,
  'la policy players reste self-only malgré le serveur commun'
);

select is(
  jsonb_array_length(public.get_private_server_leaderboard() -> 'members'),
  2,
  'la RPC de A projette exactement A et B'
);

select ok(
  not ((public.get_private_server_leaderboard() -> 'members') @> '[{"playerId":"10000000-0000-0000-0000-000000000003"}]'::jsonb),
  'la RPC de A ne contient aucune donnée de C, pourtant plus riche'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*) from public.private_server_memberships),
  1::bigint,
  'C ne voit que sa propre appartenance sur le serveur 2'
);

select is(
  jsonb_array_length(public.get_private_server_leaderboard() -> 'members'),
  1,
  'le classement de C reste isolé de A et B'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

select is(
  (select count(*) from public.private_servers),
  0::bigint,
  'D sans serveur ne découvre aucun serveur'
);

select is(
  (select count(*) from public.private_server_memberships),
  0::bigint,
  'D sans serveur ne découvre aucune appartenance'
);

-- Un serveur ne disparaît jamais tout seul : seul son créateur peut le fermer.

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$select public.close_private_server('20000000-0000-0000-0000-000000000001')$$,
  '42501',
  'Seul le créateur peut fermer ce serveur.',
  'B (membre non créateur) ne peut pas fermer le serveur de A'
);

select public.leave_private_server();

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- A quitte aussi son propre serveur (sans le fermer) : il doit rester créé, y compris sans
-- aucun membre, jusqu'à une fermeture explicite par son créateur. La lecture directe est
-- vérifiée hors RLS (reset role) car A, n'étant plus membre, ne peut plus SELECT la ligne
-- lui-même : c'est un compromis MVP assumé, documenté dans report.md.
select public.leave_private_server();

reset role;

select is(
  (select count(*) from public.private_servers where id = '20000000-0000-0000-0000-000000000001'),
  1::bigint,
  'le serveur de A reste créé même après le départ de tous les membres, y compris lui-même'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select public.close_private_server('20000000-0000-0000-0000-000000000001');

reset role;

select is(
  (select count(*) from public.private_servers where id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'A (créateur) peut fermer définitivement son serveur même sans en être membre'
);

select * from finish();
rollback;

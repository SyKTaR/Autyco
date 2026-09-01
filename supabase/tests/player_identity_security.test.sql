begin;

select plan(13);

select has_column('public', 'players', 'garage_name', 'players expose le nom du garage');
select has_column('public', 'players', 'player_name', 'players expose le pseudo');
select has_table('private', 'player_recovery_credentials', 'la table de récupération est privée');
select has_table('private', 'recovery_attempts', 'les tentatives sont suivies côté serveur');
select has_table('private', 'retired_auth_users', 'les anciennes identités sont neutralisées');

select ok(
  not has_table_privilege('anon', 'private.player_recovery_credentials', 'SELECT')
  and not has_table_privilege('authenticated', 'private.player_recovery_credentials', 'SELECT'),
  'aucun rôle client ne peut lire les hash de récupération'
);

select ok(
  (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private' and routine.proname = 'recover_player'
  ),
  'le transfert de partie est SECURITY DEFINER dans private'
);

select ok(
  not (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public' and routine.proname = 'recover_player'
  ),
  'la RPC publique de restauration reste SECURITY INVOKER'
);

select ok(
  has_function_privilege('authenticated', 'public.create_player_identity(text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_player_identity()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.rotate_recovery_code()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.recover_player(text)', 'EXECUTE'),
  'authenticated peut utiliser les RPC d’identité'
);

select ok(
  not has_function_privilege('anon', 'public.create_player_identity(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_player_identity()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rotate_recovery_code()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.recover_player(text)', 'EXECUTE'),
  'anon sans session ne peut utiliser aucune RPC d’identité'
);

select ok(
  not has_function_privilege('authenticated', 'private.consume_recovery_attempt(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.identity_payload(uuid)', 'EXECUTE'),
  'les primitives privées ne sont pas appelables directement'
);

select col_type_is(
  'private',
  'player_recovery_credentials',
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
      and relation.relname = 'player_recovery_credentials'
      and constraint_row.contype = 'u'
  ),
  'les hash de récupération sont uniques'
);

select * from finish();
rollback;

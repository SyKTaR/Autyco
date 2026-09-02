begin;

select plan(16);

select has_table('private', 'email_auth_attempts', 'les tentatives email sont confinées dans private');

select col_type_is(
  'private',
  'email_auth_attempts',
  'identifier_hash',
  'bytea',
  'l’identifiant email est stocké sous forme de hash binaire'
);

select ok(
  not has_column('private', 'email_auth_attempts', 'email'),
  'la table de quotas ne stocke aucune adresse email en clair'
);

select ok(
  not has_table_privilege('anon', 'private.email_auth_attempts', 'SELECT')
  and not has_table_privilege('authenticated', 'private.email_auth_attempts', 'SELECT'),
  'aucun rôle client ne peut lire les empreintes ou compteurs email'
);

select ok(
  (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private' and routine.proname = 'consume_email_auth_attempt'
  ),
  'la limitation privilégiée est SECURITY DEFINER dans private'
);

select ok(
  (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public' and routine.proname = 'reserve_email_auth_attempt'
  ),
  'le point d’entrée public peut atteindre private avant authentification'
);

select ok(
  has_function_privilege('anon', 'public.reserve_email_auth_attempt(text,text)', 'EXECUTE')
  and has_function_privilege(
    'authenticated',
    'public.reserve_email_auth_attempt(text,text)',
    'EXECUTE'
  ),
  'anon et authenticated peuvent réserver une tentative'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.consume_email_auth_attempt(text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.consume_email_auth_attempt(text,text)',
    'EXECUTE'
  ),
  'la primitive privée n’est jamais appelable directement'
);

select ok(
  (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private' and routine.proname = 'get_existing_player_identity'
  ),
  'la lecture d’identité existante est privilégiée dans private'
);

select ok(
  not (
    select routine.prosecdef
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public' and routine.proname = 'get_existing_player_identity'
  ),
  'la RPC publique d’identité existante reste SECURITY INVOKER'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_existing_player_identity()',
    'EXECUTE'
  ),
  'authenticated peut vérifier qu’un compte email appartient au jeu'
);

select ok(
  not has_function_privilege('anon', 'public.get_existing_player_identity()', 'EXECUTE'),
  'anon sans session ne peut pas interroger une identité joueur'
);

select is(
  (public.reserve_email_auth_attempt('invalid', 'send') ->> 'ok')::boolean,
  false,
  'une adresse manifestement invalide est refusée avant Auth'
);

select is(
  (public.reserve_email_auth_attempt('quota-send@example.test', 'send') ->> 'ok')::boolean
  and (public.reserve_email_auth_attempt('quota-send@example.test', 'send') ->> 'ok')::boolean
  and (public.reserve_email_auth_attempt('quota-send@example.test', 'send') ->> 'ok')::boolean,
  true,
  'trois envois sont admis dans une fenêtre'
);

select is(
  (public.reserve_email_auth_attempt('quota-send@example.test', 'send') ->> 'rateLimited')::boolean,
  true,
  'le quatrième envoi est bloqué'
);

select is(
  (public.reserve_email_auth_attempt('quota-verify@example.test', 'verify') ->> 'ok')::boolean
  and (public.reserve_email_auth_attempt('quota-verify@example.test', 'verify') ->> 'ok')::boolean
  and (public.reserve_email_auth_attempt('quota-verify@example.test', 'verify') ->> 'ok')::boolean
  and (public.reserve_email_auth_attempt('quota-verify@example.test', 'verify') ->> 'ok')::boolean
  and (public.reserve_email_auth_attempt('quota-verify@example.test', 'verify') ->> 'ok')::boolean
  and (public.reserve_email_auth_attempt('quota-verify@example.test', 'verify') ->> 'rateLimited')::boolean,
  true,
  'cinq vérifications sont admises puis la sixième est bloquée'
);

select * from finish();
rollback;

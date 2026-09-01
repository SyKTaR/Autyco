# Fondation Supabase — Garage Game

Cette fondation transforme Supabase en source de vérité dès qu’un joueur est connecté. Le reducer
TypeScript reste le moteur du mode local ; il n’est pas utilisé pour valider l’économie d’une partie
connectée.

## Modèle livré

- `players` : identité applicative, trésorerie, bénéfice du jour et futur drapeau de visibilité du
  garage (`garage_public`, inactif aujourd’hui).
- `market_listings` : marché individuel généré par le serveur. Un prix affiché puis acheté ne vient
  jamais du client.
- `owned_vehicles` et `vehicle_problems` : stock, collection, diagnostic, réparations, annonces,
  offres et archive des véhicules vendus.
- `owned_properties` : locations/achats, travaux, capacité et prochaine échéance.
- `transactions` : journal financier append-only avec solde après opération.
- `game_events` : historique métier append-only pour préparer les futures fonctions multijoueurs.
- `notifications` : messages personnels retournés dans l’état de jeu.
- tables `private.*` : catalogues économiques, reçus d’idempotence et fonctions privilégiées non
  exposées par la Data API.

Les montants sont stockés en euros entiers (`bigint`), comme dans le moteur TypeScript actuel. Une
évolution monétaire plus fine devra introduire les centimes explicitement, pas un type flottant.

## Autorité et sécurité

Le client ne possède aucun droit `INSERT`, `UPDATE` ou `DELETE` sur les tables du jeu. Il peut lire
ses propres lignes grâce à RLS, puis appeler deux RPC :

- `get_game_state()` : initialise si nécessaire, applique les timers/échéances échus et renvoie un
  `GameState` v2 canonique ;
- `game_action(p_action, p_payload, p_request_id)` : verrouille les lignes utiles, valide la
  transition, recalcule prix/coûts/capacité/trésorerie, journalise l’opération et renvoie le nouvel
  état canonique.

Les RPC publiques sont `SECURITY INVOKER`. Elles délèguent aux fonctions `SECURITY DEFINER` du
schéma `private`, avec `search_path = ''` et noms de relations qualifiés. Le schéma privé n’a pas à
être ajouté aux schémas exposés dans Supabase.

La clé `service_role` n’est jamais nécessaire dans le navigateur. L’adaptateur refuse aussi les clés
préfixées `sb_secret_` et les anciens JWT portant le rôle `service_role`.

## Identité anonyme et récupération

La migration `202609010002_anonymous_player_identity.sql` remplace le compte email par une session
anonyme Supabase. Le joueur choisit un nom de garage et un pseudo, puis reçoit un code hexadécimal
de 128 bits généré avec `gen_random_bytes(16)`.

Le serveur ne conserve que le SHA-256 du code. Le code en clair n'est donc pas relisible depuis la
base : lorsqu'il n'est plus présent dans la mémoire de l'application, l'écran Paramètres en émet un
nouveau et invalide le précédent. Une restauration renouvelle également le code et neutralise
l'ancienne identité anonyme afin qu'une session encore ouverte ne puisse pas recréer une partie.

La RPC limite chaque session de restauration à cinq essais par fenêtre de quinze minutes. Cette
limite complète l'entropie du secret et les limites d'inscription anonymes de Supabase ; elle ne
constitue pas, à elle seule, une limitation globale par adresse IP.

## Installation sur un projet Supabase

1. Créer un projet Supabase gratuit dans une région proche des joueurs.
2. Laisser le schéma `private` hors de **Project Settings → API → Exposed schemas**.
3. Appliquer les migrations dans l'ordre (`202609010001_backend_foundation.sql`,
   `202609010002_anonymous_player_identity.sql`, `202609010003_fix_pgcrypto_search_path.sql`, puis
   `202609010004_private_servers.sql`) avec le SQL Editor, ou installer la CLI Supabase
   puis exécuter `supabase link --project-ref <PROJECT_REF>` et `supabase db push`.
4. Dans **Authentication → Providers → Anonymous Sign-Ins**, activer les connexions anonymes. Le
   provider Email n'est pas utilisé par Garage Game.
5. Copier `.env.example` vers `.env.local`, puis renseigner uniquement l’URL et la clé publique
   publishable/anon du projet.
6. Redémarrer Vite après toute modification des variables `VITE_*`.

Ne pas exécuter le fichier `rollback/202609010001_backend_foundation_down.sql` sauf retour arrière
délibéré : il supprime toutes les données Garage Game créées par cette migration.

## Vérifications locales prévues

- `npm test` vérifie l’adaptateur REST/Auth anonyme, les contrats des RPC d'identité, l’absence de
  timestamp client dans une action critique et l’isolation des caches par compte.
- `npm run build` vérifie l’intégration React/TypeScript.
- Après installation de la CLI et démarrage de Supabase local : `supabase test db` exécute
  `tests/backend_security.test.sql` pour contrôler RLS, grants et confinement des fonctions
  privilégiées.

Le parcours réel inscription → achat → déconnexion → reconnexion exige un projet Supabase et ne peut
pas être simulé uniquement avec le bundle front.

## Serveurs privés et classement

La migration `202609010004_private_servers.sql` ajoute des groupes non découvrables par code. La
clé primaire de `private_server_memberships.player_id` limite chaque joueur à un serveur actif. Les
codes d’invitation possèdent 128 bits d’entropie et seul leur SHA-256 est stocké ; si le clair n’est
plus en mémoire, l’écran Compétition en émet un nouveau et invalide le précédent.

Les policies RLS donnent accès uniquement au serveur et aux appartenances partageant le serveur du
joueur courant. Les tables `players` et `owned_vehicles` restent self-only : la seule ouverture vers
les statistiques d’un autre membre est `get_private_server_leaderboard()`, qui vérifie
l’appartenance côté serveur et renvoie une projection en lecture seule. La valeur du parc réutilise
`private.vehicle_resale_value`, source de vérité existante du moteur économique.

`tests/private_server_security.test.sql` décrit et contrôle la matrice A/B sur un serveur, C sur un
autre et D sans serveur. Il doit être exécuté sur une base Supabase locale avant toute mise en ligne.

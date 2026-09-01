begin;

drop function if exists public.get_private_server_leaderboard();
drop function if exists public.close_private_server(uuid);
drop function if exists public.leave_private_server();
drop function if exists public.join_private_server(text, boolean);
drop function if exists public.rotate_private_server_invite();
drop function if exists public.get_current_private_server();
drop function if exists public.create_private_server(text, boolean);

drop trigger if exists players_transfer_private_server_membership on public.players;
drop function if exists private.transfer_private_server_membership_on_player_delete();
drop function if exists private.get_private_server_leaderboard();
drop function if exists private.close_private_server(uuid);
drop function if exists private.leave_private_server();
drop function if exists private.join_private_server(text, boolean);
drop function if exists private.rotate_private_server_invite();
drop function if exists private.get_current_private_server();
drop function if exists private.create_private_server(text, boolean);
drop function if exists private.delete_private_server_if_empty(uuid);
drop function if exists private.consume_private_server_join_attempt(uuid);
drop function if exists private.issue_private_server_invite(uuid, uuid);
drop function if exists private.private_server_payload(uuid);
drop function if exists private.format_private_server_code(text);

drop policy if exists private_server_memberships_select_common_server
  on public.private_server_memberships;
drop policy if exists private_servers_select_member on public.private_servers;

drop function if exists private.can_read_private_server(uuid);

drop table if exists private.private_server_join_attempts;
drop table if exists private.private_server_invites;
drop table if exists public.private_server_memberships;
drop table if exists public.private_servers;

commit;

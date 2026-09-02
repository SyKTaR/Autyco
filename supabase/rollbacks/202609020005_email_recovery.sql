begin;

drop function if exists public.reserve_email_auth_attempt(text, text);
drop function if exists public.get_existing_player_identity();
drop function if exists private.consume_email_auth_attempt(text, text);
drop function if exists private.get_existing_player_identity();
drop table if exists private.email_auth_attempts;

commit;

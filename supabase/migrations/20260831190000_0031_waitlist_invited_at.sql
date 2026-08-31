-- Sprint 24 follow-up: track when a waitlist entry has been invited to
-- create a real account. Added on direct founder request ("Let's fix
-- this" — the localhost-magic-link bug plus a request for a durable
-- staff-invite mechanism for waitlist members).
--
-- Scope decision, documented rather than silently assumed: there is no
-- self-serve staff/admin UI or admin auth flow anywhere in this codebase
-- yet (account_role does have an 'admin' value in the enum, but nothing
-- ever creates an admin account — handle_new_user() only builds
-- candidates/employers rows). Building a full admin auth system was not
-- asked for and is out of scope for this fix. For now, "staff sends it
-- manually" (the founder's own answer) means: an engineer (or Claude,
-- working from this same Supabase access) looks up the waitlist row and
-- calls POST /auth/request-code directly with that person's stored
-- name/email, then stamps this column. This column exists so that
-- manual process has somewhere real to record state, and so a future
-- admin UI has something to read/write without a second migration.

alter table public.waitlist
  add column invited_at timestamptz;

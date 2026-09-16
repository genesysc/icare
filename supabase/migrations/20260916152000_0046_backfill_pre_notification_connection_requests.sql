-- =============================================================================
-- Backfill: connection requests that predate the notification center
-- (migration 0043, applied 2026-09-15) never got a notification row —
-- the notify_connection_request trigger only fires on INSERT, so a request
-- sent before the trigger existed has no way to retroactively produce one.
--
-- Found 2026-09-16: a real candidate reported a pending connection request
-- with no unread dot. Checked directly (not assumed): 3 still-pending
-- connections, all created 2026-09-12/2026-09-14 (before 0043's
-- 2026-09-15 cutoff), had zero matching notifications rows. Every
-- accepted connection, message, and invite already had one — this gap is
-- narrow, connection_request only, and only for requests still pending as
-- of this migration (an already-accepted or declined one has no live
-- "you have a pending request" state left to surface).
--
-- One-time, idempotent (the `not exists` guard means re-running this is a
-- no-op) — not a trigger, since the actual INSERT trigger already covers
-- every request created from 0043 onward.
-- =============================================================================

insert into notifications (candidate_id, type, actor_candidate_id, connection_id, created_at)
select c.addressee_id, 'connection_request', c.requester_id, c.id, c.created_at
from connections c
where c.status = 'pending'
  and not exists (
    select 1 from notifications n where n.connection_id = c.id and n.type = 'connection_request'
  );

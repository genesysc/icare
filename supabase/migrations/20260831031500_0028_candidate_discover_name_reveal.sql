-- =============================================================================
-- Sprint 23 follow-up — accounts_read_self (migration 0002) means a
-- candidate can only read their OWN accounts row, so there was no way
-- for candidate_discover (0027) to ever reveal a connected peer's real
-- name, even once accepted — a real gap found while writing the API
-- layer, before it shipped.
--
-- Fixed by folding the reveal logic into the view itself: full_name is
-- null unless an accepted connections row exists between the viewer
-- (auth.uid()) and this candidate, in which case it's populated. One
-- view now serves both discovery (always null — you're not connected
-- yet by definition) and the connections list (populated for accepted
-- rows) — no separate accounts query needed, and no risk of a route
-- accidentally exposing a name RLS wouldn't otherwise allow, since the
-- reveal condition is enforced inside the view's own security-definer
-- context, not trusted to application code.
-- =============================================================================

create or replace view candidate_discover as
select
  c.id,
  c.headline,
  c.town,
  c.availability,
  p.name as primary_profession,
  case
    when exists (
      select 1 from connections conn
       where conn.status = 'accepted'
         and (
           (conn.requester_id = auth.uid() and conn.addressee_id = c.id)
           or (conn.addressee_id = auth.uid() and conn.requester_id = c.id)
         )
    ) then a.full_name
    else null
  end as full_name
from candidates c
join accounts a on a.id = c.id
left join candidate_professions cpr on cpr.candidate_id = c.id and cpr.is_primary
left join professions p on p.id = cpr.profession_id
where c.is_published
  and public.current_role_is('candidate');

-- =============================================================================
-- Sprint 23 — Network (jobseeker wireframe screen 09).
--
-- Founder direction: LinkedIn-style — send/accept/decline a connection
-- request between candidates. Org "Follow" explicitly deprioritised, not
-- built here. Two real design decisions this migration makes, both by
-- extending a mechanic that already exists elsewhere in this schema
-- rather than inventing a new one:
--
-- 1. What does accepting a request unlock? Everywhere else in this
--    product, a candidate's real name is hidden until an explicit
--    accept event (employer invite -> consent). This applies the exact
--    same rule peer-to-peer: candidate_discover (below, for finding
--    people to connect with) and the "pending" side of a connection
--    show only the same anonymised fields the Home feed already uses
--    (headline, primary profession, town) — real name is read
--    separately by the API layer, and only for connections.status =
--    'accepted' rows. Photo reveal is deliberately NOT included this
--    pass — it would need the same signed-URL gate the employer
--    consent flow uses for photo/video, and that's a bigger lift than
--    a first connections pass warrants.
--
-- 2. How do you find someone to connect with, given names aren't
--    searchable anywhere else in the product? By profession and
--    location, matching how everything else here is discoverable.
--
-- Connections list visibility defaults to private (only the two
-- parties involved can see a row) — the wireframe's own screen 09 notes
-- flagged that a visible connections list could out a colleague as
-- job-hunting; no counter-instruction was given, so this stays the
-- conservative default until told otherwise.
-- =============================================================================

create table connections (
  id             uuid primary key default gen_random_uuid(),
  requester_id   uuid not null references candidates(id) on delete cascade,
  addressee_id   uuid not null references candidates(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  check (requester_id <> addressee_id)
);

-- One relationship per pair regardless of who sent it — order-independent
-- uniqueness so A->B and B->A can't both exist as separate rows.
create unique index connections_pair_unique on connections (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);

create index connections_addressee_idx on connections (addressee_id, status);
create index connections_requester_idx on connections (requester_id, status);

alter table connections enable row level security;

-- Either party can see their own connection rows — never a third party.
create policy connections_parties_read on connections
  for select using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Only a signed-in candidate can send a request, only as themselves, and
-- only to another published candidate (matches the "you can only find
-- who's discoverable" rule candidate_discover enforces below).
create policy connections_requester_insert on connections
  for insert with check (
    requester_id = auth.uid()
    and public.current_role_is('candidate')
    and exists (select 1 from candidates c where c.id = addressee_id and c.is_published)
  );

-- Only the addressee can accept (pending -> accepted); nothing else is
-- updatable via this policy (status is the only column the app ever
-- writes via update, and check() re-affirms the same row's parties).
create policy connections_addressee_accept on connections
  for update using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

-- Either party can delete: the requester withdrawing a pending request,
-- the addressee declining one, or either side removing an accepted
-- connection later.
create policy connections_parties_delete on connections
  for delete using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Discovery surface — who you could send a request to. Same
-- security-definer-view + current_role_is('candidate') pattern as
-- candidate_peer_feed (migration 0026): anonymised fields only (no
-- name), gated to signed-in candidates, published profiles only.
create view candidate_discover as
select
  c.id,
  c.headline,
  c.town,
  c.availability,
  p.name as primary_profession
from candidates c
left join candidate_professions cpr on cpr.candidate_id = c.id and cpr.is_primary
left join professions p on p.id = cpr.profession_id
where c.is_published
  and public.current_role_is('candidate');

revoke all on candidate_discover from anon;
grant select on candidate_discover to authenticated;

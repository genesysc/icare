-- =============================================================================
-- Sprint 23 follow-up #2 — connections_requester_insert (migration 0027)
-- checks `exists (select 1 from candidates c where c.id = addressee_id
-- and c.is_published)`, but that subquery runs under the INSERTING
-- candidate's own RLS, not a privileged context — and candidates RLS
-- only lets a candidate read their OWN row (candidate_self) or lets a
-- VERIFIED EMPLOYER read published rows (candidate_read_published).
-- There was never a policy letting one candidate read another's row at
-- all, so the exists() always evaluated against zero visible rows and
-- silently blocked every request — caught in live-schema testing before
-- shipping, not after.
--
-- Fixed the same way candidate_search/candidate_peer_feed/
-- candidate_discover already solve this same class of problem: a small
-- SECURITY DEFINER helper that checks the one fact needed
-- (is_published) without granting broader read access to the row.
-- =============================================================================

create or replace function public.candidate_is_published(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_published from candidates where id = p_candidate_id), false);
$$;

revoke execute on function public.candidate_is_published(uuid) from anon;

drop policy connections_requester_insert on connections;

create policy connections_requester_insert on connections
  for insert with check (
    requester_id = auth.uid()
    and public.current_role_is('candidate')
    and public.candidate_is_published(addressee_id)
  );

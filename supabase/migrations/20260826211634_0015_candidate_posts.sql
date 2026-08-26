-- =============================================================================
-- Candidate posts — free-form professional stories/opinions/experiences a
-- candidate chooses to publish alongside their structured profile. Founder's
-- framing (2026-08-26 chat): a LinkedIn-style professional voice, open
-- subject matter, no pre-publish gatekeeping — "an avenue for voices to be
-- heard."
--
-- Safety net matches that framing exactly: no topic restriction, no review
-- queue before publish. What it does add is the one thing that doesn't
-- require gatekeeping to work — a report/flag action for employers, mirroring
-- the existing "submit, then a human decides" pattern already used for
-- employer verification. A confidentiality nudge is shown candidate-side at
-- compose time (frontend copy only, not enforced here) since care workers
-- are independently bound by their own professional conduct rules around
-- naming patients/colleagues — this is a reminder, not a filter.
--
-- Employer read access follows candidate_search's precedent exactly: a view
-- owned by the migration role bypasses RLS on the underlying table, so no
-- RLS policy on candidate_posts grants employers anything directly — the
-- view's WHERE clause (published, not flagged, verified employer) is the
-- only gate.
-- =============================================================================

create table candidate_posts (
  id              bigint generated always as identity primary key,
  candidate_id    uuid not null references candidates(id) on delete cascade,
  title           text,
  body            text not null check (char_length(body) between 1 and 8000),
  is_published    boolean not null default true,
  is_flagged      boolean not null default false,
  flagged_by      uuid references employers(id),
  flagged_reason  text,
  flagged_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on candidate_posts (candidate_id, created_at);

alter table candidate_posts enable row level security;

create policy candidate_posts_self on candidate_posts
  for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

create view candidate_post_search as
select cp.id, cp.candidate_id, cp.title, cp.body, cp.created_at
  from candidate_posts cp
  join candidates c on c.id = cp.candidate_id
 where cp.is_published
   and not cp.is_flagged
   and c.is_published
   and is_verified_employer();

-- Report action for a verified employer — a single auditable write via a
-- security-definer function, not open UPDATE access to candidate_posts (the
-- RLS policy above blocks that entirely; only the owning candidate can
-- write their own row).
create function flag_candidate_post(p_post_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_verified_employer() then
    raise exception 'Only verified employers can report a post';
  end if;

  update candidate_posts
     set is_flagged = true,
         flagged_by = auth.uid(),
         flagged_reason = p_reason,
         flagged_at = now()
   where id = p_post_id;

  if not found then
    raise exception 'Post not found';
  end if;
end;
$$;

revoke execute on function flag_candidate_post(bigint, text) from anon;

-- =============================================================================
-- Sprint 9 remainder — candidate-side consent to unlock photo/video/CV once
-- shortlisted (HANDOVER.md non-negotiable #4's dated override already shows
-- name/job title/location pre-shortlist; consent is specifically about
-- these three richer fields, per Sprint 9's spec in SPRINTS.md).
--
-- shortlists RLS already had candidate SELECT (shortlists_candidate_read,
-- 0005) but no way for a candidate to write candidate_consented_at — RLS
-- can't restrict to a single column, so (same pattern as
-- flag_candidate_post) a narrow security-definer RPC is the actual
-- authority, not a broad UPDATE policy that would also let a candidate
-- rewrite employer_id/created_at on their own row.
--
-- Revocable, same philosophy as dbs_records.consent_to_check: setting
-- p_consent = false clears candidate_consented_at rather than only ever
-- allowing it to be set once.
-- =============================================================================

create function set_shortlist_consent(p_employer_id uuid, p_consent boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  update shortlists
     set candidate_consented_at = case when p_consent then coalesce(candidate_consented_at, now()) else null end
   where employer_id = p_employer_id
     and candidate_id = auth.uid();

  if not found then
    raise exception 'Shortlist not found';
  end if;
end;
$$;

revoke execute on function set_shortlist_consent(uuid, boolean) from anon;

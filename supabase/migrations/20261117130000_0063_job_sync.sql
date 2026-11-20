-- =============================================================================
-- 0063 — Scheduled job sync (Stage 1 of the "less manual work" plan, 2026-11-17).
--
-- A daily GitHub Action (scripts/job-sync/sync.py) re-reads the employer
-- sources we already use and pushes the result here. upsert_sponsored_job()
-- stays locked to the service role (migration 0056); these two wrappers are
-- callable by anon but only with the shared secret (the same
-- sponsor_refresh_secret the register refresh uses — sponsor_refresh_check_secret
-- is NULL-safe), so no new GitHub secret is needed.
--
--   sync_sponsored_jobs(secret, jobs[])   upsert up to 25 jobs per call.
--       * Keeps an existing job's posted_at when the source gives no date
--         (so evergreen pages don't look "new" every day).
--       * source_job_id must look like '<source>:<id>'.
--   close_unseen_sponsored_jobs(secret, prefix, seen[])
--       closes jobs of one source that were not seen in this run. Refuses
--       (raises) if fewer than min_ratio of the source's live jobs were seen —
--       a changed or blocked site must not wipe the board.
--
-- Anon has a 3s statement_timeout, so the caller sends small batches.
-- =============================================================================

create or replace function sync_sponsored_jobs(p_secret text, p_jobs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j jsonb;
  r record;
  v_posted timestamptz;
  v_new integer := 0;
  v_updated integer := 0;
  v_open integer := 0;
  v_hidden integer := 0;
begin
  perform sponsor_refresh_check_secret(p_secret);

  if p_jobs is null or jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) > 25 then
    raise exception 'bad batch';
  end if;

  for j in select * from jsonb_array_elements(p_jobs) loop
    if coalesce(j->>'source_job_id', '') !~ '^[a-z0-9-]+:.+' then
      raise exception 'bad source_job_id: %', j->>'source_job_id';
    end if;
    -- an advert-level "status" must never be set from outside (closing is
    -- done by close_unseen_sponsored_jobs)
    j := j - 'status' - 'source';

    select posted_at into v_posted from sponsored_jobs
     where source = 'manual' and source_job_id = j->>'source_job_id';
    if found then
      v_updated := v_updated + 1;
      if coalesce(j->>'posted_at', '') = '' then
        j := jsonb_set(j, '{posted_at}', to_jsonb(v_posted));
      end if;
    else
      v_new := v_new + 1;
    end if;

    select * into r from upsert_sponsored_job(j);
    if r.status = 'open' then v_open := v_open + 1; else v_hidden := v_hidden + 1; end if;
  end loop;

  return jsonb_build_object('new', v_new, 'updated', v_updated, 'open', v_open, 'hidden', v_hidden);
end;
$$;
revoke all on function sync_sponsored_jobs from public, authenticated;
grant execute on function sync_sponsored_jobs to anon;

create or replace function close_unseen_sponsored_jobs(
  p_secret text, p_prefix text, p_seen text[], p_min_ratio numeric default 0.5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live integer;
  v_seen integer;
  v_closed integer;
begin
  perform sponsor_refresh_check_secret(p_secret);

  if p_prefix is null or p_prefix !~ '^[a-z0-9-]+:$' then
    raise exception 'bad prefix';
  end if;

  select count(*) into v_live from sponsored_jobs
   where source = 'manual' and starts_with(source_job_id, p_prefix) and status <> 'closed';
  select count(*) into v_seen from sponsored_jobs
   where source = 'manual' and starts_with(source_job_id, p_prefix)
     and source_job_id = any(coalesce(p_seen, '{}'));

  if v_live > 0 and v_seen < v_live * p_min_ratio then
    raise exception 'refusing to close: only % of % live % jobs were seen', v_seen, v_live, p_prefix;
  end if;

  update sponsored_jobs set status = 'closed', updated_at = now()
   where source = 'manual' and starts_with(source_job_id, p_prefix) and status <> 'closed'
     and not (source_job_id = any(coalesce(p_seen, '{}')));
  get diagnostics v_closed = row_count;

  return jsonb_build_object('live_before', v_live, 'seen', v_seen, 'closed', v_closed);
end;
$$;
revoke all on function close_unseen_sponsored_jobs from public, authenticated;
grant execute on function close_unseen_sponsored_jobs to anon;

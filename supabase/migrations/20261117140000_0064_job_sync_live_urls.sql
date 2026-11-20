-- 0064 — let the job sync see which jobs of one source are live (2026-11-17).
--
-- Some employer listings lag behind the live site (Renaissance's sitemap
-- omits brand-new jobs). Before closing a job it no longer finds in the
-- listing, scripts/job-sync/sync.py re-opens that job's own page; it needs the
-- list of non-closed ids + advert URLs for that. Secret-gated like 0063.

create or replace function live_sponsored_job_urls(p_secret text, p_prefix text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sponsor_refresh_check_secret(p_secret);

  if p_prefix is null or p_prefix !~ '^[a-z0-9-]+:$' then
    raise exception 'bad prefix';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', source_job_id, 'url', apply_url))
      from sponsored_jobs
     where source = 'manual' and starts_with(source_job_id, p_prefix) and status <> 'closed'
  ), '[]'::jsonb);
end;
$$;
revoke all on function live_sponsored_job_urls from public, authenticated;
grant execute on function live_sponsored_job_urls to anon;

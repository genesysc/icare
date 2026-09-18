-- =============================================================================
-- Follow-up to 0048 — the cron ingestion job has no way to know which
-- items it's already stored, since it runs as `anon` (no candidate
-- session) and news_items_candidate_read requires current_role_is
-- ('candidate'). Without this, it would have to re-attempt the expensive
-- og:image-fetch-with-fallback-to-Unsplash step for every item on every
-- run, not just genuinely new ones — real, avoidable cost on a job that
-- runs every couple of hours. This RPC lets it check in bulk, cheaply,
-- before doing any of that work.
-- =============================================================================

create or replace function news_item_known_external_ids(p_secret text, p_external_ids text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select value into v_secret from app_secrets where key = 'news_ingest_secret';
  if v_secret is null or p_secret <> v_secret then
    raise exception 'unauthorized';
  end if;

  return array(
    select external_id from news_items where external_id = any(p_external_ids)
  );
end;
$$;

revoke all on function news_item_known_external_ids from authenticated;
grant execute on function news_item_known_external_ids to anon;

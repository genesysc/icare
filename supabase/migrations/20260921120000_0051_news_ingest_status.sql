-- Diagnostic RPC so a stalled ingestion cron (e.g. a missing/rotated
-- NEWS_INGEST_SECRET or NEWSDATA_API_KEY Worker secret — see HANDOVER.md's
-- news-module sections) is visible from GET /news/ingest-status rather
-- than requiring a direct database query to notice. Same shared-secret
-- pattern as ingest_news_item()/prune_stale_news_items() — no user
-- session involved, no service_role key, gated on the same
-- news_ingest_secret already used to authenticate the cron job itself.

create or replace function public.news_ingest_status(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
  v_result jsonb;
begin
  select value into v_secret from app_secrets where key = 'news_ingest_secret';
  if v_secret is null or p_secret <> v_secret then
    raise exception 'unauthorized';
  end if;

  select jsonb_build_object(
    'total_items', count(*),
    'most_recent_fetched_at', max(fetched_at),
    'most_recent_published_at', max(published_at),
    'items_fetched_last_2h', count(*) filter (where fetched_at >= now() - interval '2 hours'),
    'items_fetched_last_24h', count(*) filter (where fetched_at >= now() - interval '24 hours'),
    -- The cron runs every 2 hours; a 3-hour buffer tolerates one missed
    -- cycle before flagging a real stall.
    'is_stale', (max(fetched_at) is null or max(fetched_at) < now() - interval '3 hours'),
    'checked_at', now()
  ) into v_result
  from news_items;

  return v_result;
end;
$function$;

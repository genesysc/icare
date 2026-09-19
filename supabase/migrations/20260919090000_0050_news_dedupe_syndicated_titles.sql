-- Wire-syndicated stories (WHO/AAP/Reuters/Postmedia copy republished
-- verbatim by many regional outlets) were showing up as 2-4 separate
-- cards on the same headline, since dedup only ever looked at
-- external_id/URL and every republishing outlet has its own URL.
-- Adds a normalized_title column + a duplicate check inside
-- ingest_news_item() so a second outlet's copy of an already-ingested
-- headline is recognized and skipped rather than inserted as a new item.

create or replace function public.normalize_news_title(p_title text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

alter table news_items add column if not exists normalized_title text;
update news_items set normalized_title = normalize_news_title(title) where normalized_title is null;
alter table news_items alter column normalized_title set not null;

create index if not exists idx_news_items_normalized_title
  on news_items (normalized_title, published_at desc);

-- Clean up duplicates already ingested before this fix existed — keep the
-- earliest-published copy of each normalized title, drop the rest. Safe:
-- verified zero rows in news_item_likes/news_item_comments before running
-- this, so no interaction data can be orphaned by the deletes.
with ranked as (
  select id, row_number() over (
    partition by normalized_title
    order by published_at asc, id asc
  ) as rn
  from news_items
)
delete from news_items where id in (select id from ranked where rn > 1);

create or replace function public.ingest_news_item(
  p_secret text,
  p_external_id text,
  p_title text,
  p_summary text,
  p_url text,
  p_image_url text,
  p_source_name text,
  p_category text,
  p_published_at timestamp with time zone
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
  v_id uuid;
  v_normalized_title text;
  v_duplicate_id uuid;
begin
  select value into v_secret from app_secrets where key = 'news_ingest_secret';
  if v_secret is null or p_secret <> v_secret then
    raise exception 'unauthorized';
  end if;

  v_normalized_title := normalize_news_title(p_title);

  -- A different item already carrying this exact normalized title within
  -- the retention window is the same underlying story from another
  -- syndicated outlet, not a new one -- skip rather than create a second
  -- card. (external_id <> p_external_id excludes this item's own refresh
  -- of itself, which still goes through the normal upsert below.)
  select id into v_duplicate_id
  from news_items
  where normalized_title = v_normalized_title
    and external_id <> p_external_id
    and published_at >= now() - interval '30 days'
  limit 1;

  if v_duplicate_id is not null then
    return v_duplicate_id;
  end if;

  insert into news_items (external_id, title, normalized_title, summary, url, image_url, source_name, category, published_at)
  values (p_external_id, p_title, v_normalized_title, p_summary, p_url, p_image_url, p_source_name, coalesce(p_category, 'general'), p_published_at)
  on conflict (external_id) do update
    set title = excluded.title,
        normalized_title = excluded.normalized_title,
        summary = excluded.summary,
        -- Never clobber an already-resolved image with null on a later
        -- refresh of the same item (og:image fetch is best-effort and
        -- only attempted once, at first ingest -- see the Worker's cron
        -- handler).
        image_url = coalesce(news_items.image_url, excluded.image_url),
        fetched_at = now()
  returning id into v_id;

  return v_id;
end;
$function$;

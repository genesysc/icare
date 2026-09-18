-- =============================================================================
-- News feed module — candidate Home screen ("Rounds"), 2026-09-18.
--
-- Handover: iCare Home Screen News Module Build Handover (uploaded
-- alongside a static HTML mockup, reference-only — that mockup assumes a
-- Next.js App Router codebase this repo isn't; rebuilt here inside the
-- real Cloudflare Workers + Hono + self-contained-HTML app instead, same
-- adaptation this session already did for the blog handover). See
-- HANDOVER.md's news-feed section for the full design writeup, including
-- the open questions the handover itself asked engineering to flag back
-- (rolling window, comment moderation, which free news sources) rather
-- than silently deciding them.
--
-- No service_role key anywhere in this codebase (middleware.ts's own
-- comment: "no service_role key involved" — a deliberate boundary, kept
-- here too). The cron-triggered ingestion job has no candidate session to
-- authenticate as, so it can't go through ordinary RLS the way every
-- other write in this schema does. app_secrets + the secret-gated
-- ingest_news_item()/prune_stale_news_items() RPCs below are how it
-- authenticates instead — same SECURITY DEFINER pattern already used for
-- complete_oauth_employer_signup (0043), just gated by a shared secret
-- instead of auth.uid() recency, since there's no signed-in user at all
-- on this path.
-- =============================================================================

create table news_items (
  id             uuid primary key default gen_random_uuid(),
  -- Stable id derived from the feed item's own guid/link (hashed —
  -- computed by the Worker, not here) — lets a re-fetch of the same feed
  -- upsert instead of duplicating, see ingest_news_item() below.
  external_id    text not null unique,
  title          text not null,
  summary        text,
  url            text not null,
  -- Source's own og:image when the Worker's fetch found one; an Unsplash
  -- search-API photo id otherwise (never null after ingest — the Worker
  -- always resolves one or the other before calling ingest_news_item(),
  -- see HANDOVER.md on why the source-image requirement rarely has
  -- anything to pull from for these particular free feeds in practice).
  image_url      text,
  source_name    text not null,
  category       text not null default 'general'
                   check (category in ('adult-social-care', 'nhs-policy', 'global-health', 'innovation', 'general')),
  published_at   timestamptz not null,
  fetched_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index news_items_published_idx on news_items (published_at desc);
create index news_items_category_idx on news_items (category, published_at desc);

alter table news_items enable row level security;

-- Candidate-app content, not public marketing content (that's the
-- separate /blog, deliberately anon-readable by design) — gated the same
-- way candidate_discover/candidate_peer_feed already are.
create policy news_items_candidate_read on news_items
  for select using (public.current_role_is('candidate'));

-- No insert/update/delete policy at all, on purpose — every write goes
-- through ingest_news_item()/prune_stale_news_items() below, never
-- direct table access, same as candidate_badges having no client write
-- path at all.

create table news_item_likes (
  news_item_id   uuid not null references news_items(id) on delete cascade,
  candidate_id   uuid not null references candidates(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (news_item_id, candidate_id)
);

alter table news_item_likes enable row level security;

create policy news_item_likes_read on news_item_likes
  for select using (public.current_role_is('candidate'));

create policy news_item_likes_insert on news_item_likes
  for insert with check (candidate_id = auth.uid() and public.current_role_is('candidate'));

create policy news_item_likes_delete on news_item_likes
  for delete using (candidate_id = auth.uid());

create table news_item_comments (
  id             uuid primary key default gen_random_uuid(),
  news_item_id   uuid not null references news_items(id) on delete cascade,
  candidate_id   uuid not null references candidates(id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 1000),
  -- Minimal moderation, since a real policy hadn't been discussed with
  -- the client yet (handover's own §8 flagged this explicitly) — a
  -- report threshold auto-hides rather than nothing at all. Not a
  -- substitute for a real decision later, see HANDOVER.md.
  report_count   integer not null default 0,
  is_hidden      boolean not null default false,
  created_at     timestamptz not null default now()
);

create index news_item_comments_item_idx on news_item_comments (news_item_id, created_at);

alter table news_item_comments enable row level security;

-- Any candidate can read any non-hidden comment...
create policy news_item_comments_read on news_item_comments
  for select using (public.current_role_is('candidate') and not is_hidden);

-- ...and an author can always see their own, even if auto-hidden, so it
-- doesn't just silently vanish on them with no explanation. Postgres ORs
-- multiple select policies together, so this genuinely adds a second
-- allowed path rather than narrowing the first.
create policy news_item_comments_own_read on news_item_comments
  for select using (candidate_id = auth.uid());

create policy news_item_comments_insert on news_item_comments
  for insert with check (candidate_id = auth.uid() and public.current_role_is('candidate'));

create policy news_item_comments_own_delete on news_item_comments
  for delete using (candidate_id = auth.uid());

-- Reporting has to go through an RPC, not a policy — it needs to update
-- report_count/is_hidden on a comment that isn't the reporter's own,
-- which no UPDATE policy here allows (there isn't one at all).
create or replace function report_news_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_role_is('candidate') then
    raise exception 'not authorized';
  end if;

  update news_item_comments
     set report_count = report_count + 1,
         is_hidden = (report_count + 1) >= 3
   where id = p_comment_id;
end;
$$;

revoke all on function report_news_comment from anon;
grant execute on function report_news_comment to authenticated;

-- Read-optimized feed view — counts + "did I already like this" computed
-- once here rather than per-request client-side joins, same pattern as
-- my_notifications/candidate_peer_feed elsewhere in this schema.
create view news_feed as
select
  n.*,
  (select count(*) from news_item_likes l where l.news_item_id = n.id) as like_count,
  (select count(*) from news_item_comments c where c.news_item_id = n.id and not c.is_hidden) as comment_count,
  exists(
    select 1 from news_item_likes l where l.news_item_id = n.id and l.candidate_id = auth.uid()
  ) as liked_by_me
from news_items n
where public.current_role_is('candidate');

revoke all on news_feed from anon;
grant select on news_feed to authenticated;

-- ---------------------------------------------------------------------------
-- Cron-ingestion authentication (no service_role key — see header comment).
-- ---------------------------------------------------------------------------

create table app_secrets (
  key   text primary key,
  value text not null
);

alter table app_secrets enable row level security;
-- Deliberately zero policies — nobody (anon, authenticated, service
-- context via PostgREST) can read or write this table at all. Only a
-- SECURITY DEFINER function, which runs as the table owner and bypasses
-- RLS, can see it. The actual secret value is set once via direct SQL
-- (not committed anywhere in git) and mirrored as a Cloudflare Worker
-- secret — see HANDOVER.md for the exact manual step.

create or replace function ingest_news_item(
  p_secret       text,
  p_external_id  text,
  p_title        text,
  p_summary      text,
  p_url          text,
  p_image_url    text,
  p_source_name  text,
  p_category     text,
  p_published_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_id uuid;
begin
  select value into v_secret from app_secrets where key = 'news_ingest_secret';
  if v_secret is null or p_secret <> v_secret then
    raise exception 'unauthorized';
  end if;

  insert into news_items (external_id, title, summary, url, image_url, source_name, category, published_at)
  values (p_external_id, p_title, p_summary, p_url, p_image_url, p_source_name, coalesce(p_category, 'general'), p_published_at)
  on conflict (external_id) do update
    set title = excluded.title,
        summary = excluded.summary,
        -- Never clobber an already-resolved image with null on a later
        -- refresh of the same item (og:image fetch is best-effort and
        -- only attempted once, at first ingest — see the Worker's cron
        -- handler).
        image_url = coalesce(news_items.image_url, excluded.image_url),
        fetched_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function ingest_news_item from authenticated;
grant execute on function ingest_news_item to anon;

-- Separate from ingest — pruning on every single item insert during an
-- ~80-item batch would run the same delete scan ~80 times for no reason.
-- Called once at the end of a cron run instead. A generous 30 days, well
-- past the ~6-day display window (see news_feed reads in src/news.ts) —
-- keeps history if the window is ever widened later without a migration,
-- while still bounding table growth.
create or replace function prune_stale_news_items(p_secret text)
returns void
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

  delete from news_items where published_at < now() - interval '30 days';
end;
$$;

revoke all on function prune_stale_news_items from authenticated;
grant execute on function prune_stale_news_items to anon;

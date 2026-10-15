-- Rule-alert cards for the daily news feature (HANDOVER_daily-news §5 Step 3).
--
-- Zero-AI pipeline: the Worker's 2-hourly cron (src/news-ingest.ts) reads
-- the GOV.UK Atom feeds for UKVI / Home Office / DHSC and stores headline
-- + link + date + source only — no rewriting, no excerpts. Shown as cards
-- in the News tab (/news-feed) and pinned in Rounds for 7 days, so members
-- see something fresh daily even when the AI drafter has nothing approved.
--
-- Writes go through ingest_rule_alert() (SECURITY DEFINER + shared-secret
-- gate, same pattern as ingest_news_item() in 0048 — no service_role key
-- anywhere). Reads are candidate-only, same gate as news_feed /
-- candidate_peer_feed. No DELETE/DROP/TRUNCATE in this file, so it can be
-- applied unattended or pasted into the SQL editor as-is.

create table rule_alerts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  url          text not null unique,
  source       text not null,
  published_at timestamptz not null,
  pinned_until timestamptz not null,
  created_at   timestamptz not null default now()
);

alter table rule_alerts enable row level security;

-- Signed-in candidates only (includes half-onboarded members — the News
-- tab, like Sponsor check, has no onboarding gate; requireAuth + this
-- policy is the whole gate, no is_published check).
create policy rule_alerts_candidate_read on rule_alerts
  for select using (public.current_role_is('candidate'));

create index rule_alerts_pinned_until_idx on rule_alerts (pinned_until desc);

create or replace function ingest_rule_alert(
  p_secret       text,
  p_title        text,
  p_url          text,
  p_source       text,
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

  -- Pinned for 7 days from the source's own publish date (handover §5:
  -- "Pinned in the feed for 7 days"). Re-ingesting the same URL refreshes
  -- the pin window rather than duplicating the card.
  insert into rule_alerts (title, url, source, published_at, pinned_until)
  values (p_title, p_url, p_source, p_published_at, p_published_at + interval '7 days')
  on conflict (url) do update
    set title = excluded.title,
        source = excluded.source,
        published_at = excluded.published_at,
        pinned_until = excluded.pinned_until
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function ingest_rule_alert from authenticated;
grant execute on function ingest_rule_alert to anon;

revoke all on rule_alerts from anon;
grant select on rule_alerts to authenticated;

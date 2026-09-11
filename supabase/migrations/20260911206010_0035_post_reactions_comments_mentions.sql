-- =============================================================================
-- Rounds reactions/comments/mentions (build spec §2).
--
-- Reactions: exactly one type, "Helpful" — no share/repost by design (spec:
-- uncontrolled resharing works against the consent-gated visibility model
-- everywhere else on this platform). Toggled via a security-definer RPC,
-- same shape as flag_candidate_post (0015) and set_shortlist_consent (0017),
-- because "can this candidate see the post" needs the same visibility check
-- candidate_peer_feed (0026) already encodes — pulled into a shared helper
-- here rather than repeated inline, following the precedent set by 0029's
-- extraction of a security-definer helper for a similar RLS-duplication
-- problem.
--
-- Comments: same visibility gate, via add_post_comment(). Deleting a
-- comment is a plain RLS delete (own comment only) — no visibility check
-- needed to delete something you already wrote.
--
-- Mentions: platform-wide per the spec's explicit client override — a
-- mention is equivalent to Network directory-level info (name/role/
-- employer), so it isn't gated by connection status the way reactions/
-- comments are. Written by the post's own author only, alongside the post;
-- read via a view (post_mentions_feed) that joins candidate_discover, so a
-- mention can never surface more than the directory already would.
-- =============================================================================

create or replace function candidate_can_view_post(p_post_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from candidate_posts cp
      join candidates c on c.id = cp.candidate_id
     where cp.id = p_post_id
       and cp.is_published
       and not cp.is_flagged
       and c.is_published
       and current_role_is('candidate'::account_role)
       and (
         cp.visibility = 'public'
         or cp.candidate_id = auth.uid()
         or exists (
           select 1 from connections conn
            where conn.status = 'accepted'
              and (
                (conn.requester_id = auth.uid() and conn.addressee_id = cp.candidate_id)
                or (conn.addressee_id = auth.uid() and conn.requester_id = cp.candidate_id)
              )
         )
       )
  );
$$;

revoke execute on function candidate_can_view_post(bigint) from anon;

-- --- Reactions ---------------------------------------------------------

create table post_reactions (
  post_id      bigint not null references candidate_posts(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (post_id, candidate_id)
);

alter table post_reactions enable row level security;

-- Read your own reaction rows directly (e.g. "have I reacted to this").
-- Reaction counts for other people's posts come from candidate_peer_feed
-- (0037), a view that bypasses this policy the same way candidate_search
-- already bypasses candidate_posts_self.
create policy post_reactions_read_own on post_reactions
  for select using (candidate_id = auth.uid());

-- No insert/delete policy — toggling only ever happens through
-- toggle_post_reaction() below, so the visibility check can't be bypassed
-- by inserting into post_reactions directly.

create function toggle_post_reaction(p_post_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reacted boolean;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not candidate_can_view_post(p_post_id) then
    raise exception 'Post not found';
  end if;

  delete from post_reactions where post_id = p_post_id and candidate_id = auth.uid();
  if found then
    return false;
  end if;

  insert into post_reactions (post_id, candidate_id) values (p_post_id, auth.uid());
  return true;
end;
$$;

revoke execute on function toggle_post_reaction(bigint) from anon;

-- --- Comments ------------------------------------------------------------

create table post_comments (
  id           bigint generated always as identity primary key,
  post_id      bigint not null references candidate_posts(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 2000),
  created_at   timestamptz not null default now()
);

create index on post_comments (post_id, created_at);

alter table post_comments enable row level security;

create policy post_comments_delete_own on post_comments
  for delete using (candidate_id = auth.uid());

-- No select/insert policy — read via post_comments_feed (0037), write via
-- add_post_comment() below (needs the same visibility check as reactions).

create function add_post_comment(p_post_id bigint, p_body text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := trim(p_body);
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'Comment must be 1-2000 characters';
  end if;
  if not candidate_can_view_post(p_post_id) then
    raise exception 'Post not found';
  end if;

  insert into post_comments (post_id, candidate_id, body)
  values (p_post_id, auth.uid(), v_body)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function add_post_comment(bigint, text) from anon;

-- --- Mentions --------------------------------------------------------------

create table post_mentions (
  post_id             bigint not null references candidate_posts(id) on delete cascade,
  mentioned_candidate_id uuid not null references candidates(id) on delete cascade,
  primary key (post_id, mentioned_candidate_id)
);

alter table post_mentions enable row level security;

-- Only the post's own author can tag someone in it, and only at/after the
-- post already exists and belongs to them.
create policy post_mentions_insert_by_author on post_mentions
  for insert with check (
    exists (
      select 1 from candidate_posts cp
       where cp.id = post_id and cp.candidate_id = auth.uid()
    )
  );

create policy post_mentions_delete_by_author on post_mentions
  for delete using (
    exists (
      select 1 from candidate_posts cp
       where cp.id = post_id and cp.candidate_id = auth.uid()
    )
  );

-- No select policy — read via post_mentions_feed (0037), which only ever
-- exposes what candidate_discover already exposes to any candidate.

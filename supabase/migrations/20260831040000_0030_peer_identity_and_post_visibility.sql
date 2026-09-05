-- =============================================================================
-- Sprint 24 — correction to Sprints 22/23's peer-visibility model.
--
-- Founder direction, explicit and unambiguous: within iCare itself,
-- candidates are NOT hiding from each other — everyone on the platform
-- is assumed to be a fellow healthcare professional, not a recruiter
-- evaluating anyone. Name and photo should be visible candidate-to-
-- candidate, free-for-all, same as any ordinary professional network.
-- The name/photo/contact-hidden-until-consent rule stays exactly as it
-- was, but ONLY on the employer/iRecruit side — that boundary is
-- unchanged by this migration.
--
-- This reverses candidate_discover's Sprint 23 name-reveal-on-accept
-- condition (0028) and candidate_peer_feed's Sprint 22 name-free
-- attribution (0026): both now join accounts.full_name unconditionally.
-- Still gated by current_role_is('candidate') — the employer/candidate
-- audience boundary is what these views exist to enforce, not a
-- candidate-to-candidate one.
--
-- New: posts gain a visibility choice (public/connections), founder's
-- own words — "if it's a public one, everybody... can view it. If it's
-- a private one... anyone outside of the network of that specific user
-- cannot see that post." connections.status = 'accepted' is exactly
-- "the network of that user" already built in Sprint 23. Defaults to
-- 'public' — posts were already effectively public before this (visible
-- to any verified employer via candidate_post_search, no consent
-- required), so this doesn't newly expose anything by default, it adds
-- the option to narrow.
--
-- candidate_post_search (employer-facing) also gated on visibility =
-- 'public' now — a design call, not explicitly asked: a post someone
-- marked visible only to their own connections reads as "not for
-- outsiders," and an employer is more of an outsider than an
-- unconnected candidate is, not less. Worth flagging back to the
-- founder rather than assuming silently.
-- =============================================================================

alter table candidate_posts
  add column visibility text not null default 'public' check (visibility in ('public', 'connections'));

create or replace view candidate_discover as
select
  c.id,
  c.headline,
  c.town,
  c.availability,
  p.name as primary_profession,
  a.full_name,
  (c.photo_path is not null) as has_photo
from candidates c
join accounts a on a.id = c.id
left join candidate_professions cpr on cpr.candidate_id = c.id and cpr.is_primary
left join professions p on p.id = cpr.profession_id
where c.is_published
  and public.current_role_is('candidate');

-- Column order matters here: CREATE OR REPLACE VIEW can only append
-- columns at the end, not reorder or insert mid-list (Postgres 42P16)
-- — so the original id/candidate_id/title/body/created_at/headline/
-- town/primary_profession order from migration 0026 is preserved
-- exactly, with full_name/has_photo/visibility appended after.
create or replace view candidate_peer_feed as
select
  cp.id,
  cp.candidate_id,
  cp.title,
  cp.body,
  cp.created_at,
  c.headline,
  c.town,
  p.name as primary_profession,
  a.full_name,
  (c.photo_path is not null) as has_photo,
  cp.visibility
from candidate_posts cp
join candidates c on c.id = cp.candidate_id
join accounts a on a.id = c.id
left join candidate_professions cpr on cpr.candidate_id = c.id and cpr.is_primary
left join professions p on p.id = cpr.profession_id
where cp.is_published
  and not cp.is_flagged
  and c.is_published
  and public.current_role_is('candidate')
  and (
    cp.visibility = 'public'
    or exists (
      select 1 from connections conn
       where conn.status = 'accepted'
         and (
           (conn.requester_id = auth.uid() and conn.addressee_id = cp.candidate_id)
           or (conn.addressee_id = auth.uid() and conn.requester_id = cp.candidate_id)
         )
    )
  );

create or replace view candidate_post_search as
select cp.id, cp.candidate_id, cp.title, cp.body, cp.created_at
  from candidate_posts cp
  join candidates c on c.id = cp.candidate_id
 where cp.is_published
   and not cp.is_flagged
   and cp.visibility = 'public'
   and c.is_published
   and is_verified_employer();

-- =============================================================================
-- Rounds (feed) — post types beyond plain text: photo/video/document media,
-- and a scoped check-in. candidate_posts already existed (0015); this adds
-- the columns the new composer needs without touching its existing
-- text-post behaviour (post_type defaults to 'text', every existing row is
-- unaffected).
--
-- Check-in is deliberately NOT free-text/geolocation — see the build spec
-- (icare_rounds_network_messages_profile_spec.md §2): an open "check in
-- anywhere" field could broadcast a domiciliary-care client's home address.
-- checkin_venue_name is a name the candidate picks (either an employer from
-- the existing employers table, or a free-typed name for a training
-- centre/conference not in that table) — never raw coordinates, which are
-- never stored anywhere in this schema.
-- =============================================================================

alter table candidate_posts
  add column post_type text not null default 'text'
    check (post_type in ('text', 'photo', 'video', 'document', 'checkin')),
  add column media_path text,
  add column media_filename text,
  add column media_size_bytes bigint,
  add column media_duration_seconds integer,
  add column checkin_venue_name text,
  add column checkin_venue_type text
    check (checkin_venue_type in ('employer', 'external')),
  add column checkin_employer_id uuid references employers(id);

alter table candidate_posts
  add constraint candidate_posts_checkin_needs_venue
    check (post_type <> 'checkin' or checkin_venue_name is not null);

alter table candidate_posts
  add constraint candidate_posts_checkin_employer_matches_type
    check (checkin_employer_id is null or checkin_venue_type = 'employer');

-- Optional note on a connect request (Network §3) — the connect flow reveals
-- a textarea before sending, not a blind request.
alter table connections
  add column note text check (char_length(note) <= 500);

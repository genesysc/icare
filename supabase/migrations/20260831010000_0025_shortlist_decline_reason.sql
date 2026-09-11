-- =============================================================================
-- Sprint 18 — Jobseeker Invites screen (frontend).
--
-- HANDOVER.md/wireframe screen 04 (the invite-detail consent screen)
-- requires that a decline always sends one of a fixed set of reasons to
-- the employer — "Prefer not to say" is a valid, complete answer, but
-- there's no way to decline with literally nothing shared. That's a real
-- product decision, not a UI nicety, so it needs a column: the existing
-- POST /me/shortlists/:id/withdraw route (src/candidates.ts) already
-- closes a pipeline candidate-side, but had nowhere to record why.
--
-- Nullable and only ever set alongside closed_at (a still-open pipeline
-- has no reason to give): both an outright decline (never consented) and
-- a later withdrawal (consented, then changed their mind) close the same
-- way, so one column covers both — the UI's own copy is what tells them
-- apart, not the schema.
--
-- Fixed list matches the wireframe's decline-reason picker exactly (screen
-- 04's six options) — not left open-text, so it stays comparable across
-- the whole workforce per that screen's own note.
-- =============================================================================

alter table shortlists
  add column decline_reason text
    check (decline_reason in (
      'not_looking',
      'wrong_pattern',
      'too_far',
      'wrong_role',
      'accepted_elsewhere',
      'prefer_not_to_say'
    ));

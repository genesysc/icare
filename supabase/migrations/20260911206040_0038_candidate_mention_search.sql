-- Mentions are platform-wide (build spec §2 — an explicit client override
-- of an earlier compliance flag: mentioning someone you haven't connected
-- with is fine, since it surfaces no more than the Network directory
-- already does). candidate_discover (0037) isn't the right source for this
-- — it deliberately excludes yourself and existing accepted connections,
-- which is right for "people you may know" but wrong for "who can I
-- @mention" (you should be able to mention an existing connection too).
create view candidate_mention_search as
select
  c.id,
  a.full_name,
  p.name as primary_profession,
  (c.photo_path is not null) as has_photo
from candidates c
  join accounts a on a.id = c.id
  left join candidate_professions cpr on cpr.candidate_id = c.id and cpr.is_primary
  left join professions p on p.id = cpr.profession_id
where c.is_published
  and current_role_is('candidate'::account_role);

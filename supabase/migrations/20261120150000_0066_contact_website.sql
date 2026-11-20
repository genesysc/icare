-- 0066 — save the company website with each contact (founder request 2026-11-20).
alter table company_contacts add column if not exists website text;

update company_contacts cc
   set website = c.website
  from companies c
 where c.id = cc.company_id and cc.website is null and c.website is not null;

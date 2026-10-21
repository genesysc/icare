-- =============================================================================
-- 0061 — Close the null-secret hole in the shared-secret RPCs (2026-10-21).
--
-- Several SECURITY DEFINER functions granted to anon checked their secret
-- with
--     if v_secret is null or p_secret <> v_secret then raise ...
-- When the caller passes p_secret = NULL, `p_secret <> v_secret` is NULL,
-- not true, so the IF doesn't fire and the check is skipped. Anyone with
-- the public site key could call ingest_news_item, prune_stale_news_items,
-- news_item_known_external_ids, news_ingest_status and ingest_rule_alert
-- without the secret.
--
-- Fix: rewrite every public function whose body contains that comparison
-- to use `is distinct from` (NULL-safe). CREATE OR REPLACE keeps owners and
-- grants. Functions written later must use `is distinct from` too.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%p_secret <> v_secret%'
  loop
    execute replace(pg_get_functiondef(r.oid), 'p_secret <> v_secret', 'p_secret is distinct from v_secret');
  end loop;
end;
$$;

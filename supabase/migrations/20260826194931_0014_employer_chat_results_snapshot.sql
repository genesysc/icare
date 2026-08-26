-- Store the actual search_candidates result rows alongside result_count, so
-- reloading the chat page can re-render the result cards instead of just a
-- count. Safe to snapshot: these are exactly the fields candidate_search
-- already permits this employer to see, RLS-self-scoped to their own chat
-- log (employer_chat_messages_self), so nothing here is a fresh disclosure.

alter table employer_chat_messages
  add column results_snapshot jsonb;

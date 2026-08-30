import { Hono } from "hono";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";
import { checkProtectedCharacteristics, containsEvaluativeLanguage, GUARDRAIL_REDIRECT_MESSAGE } from "./employer-chat-guardrail";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  AI: Ai;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
  user: User;
};

const employerChat = new Hono<{ Bindings: Bindings; Variables: Variables }>();
employerChat.use("*", requireAuth);

// SPRINTS.md Sprint 8 — employer chat + candidate search.
//
// Non-negotiable #5: "AI never scores, ranks, or filters a candidate...
// an employer conversational AI search must be descriptive, not
// evaluative, and must hard-exclude protected characteristics — the
// guardrail needs a real validation layer, not just a prompt instruction."
// Three independent layers enforce this (see employer-chat-guardrail.ts
// for the full explanation): the search_candidates tool schema below has
// structurally no field for a protected characteristic; every message is
// checked against a deterministic keyword guardrail BEFORE it ever reaches
// the model; and the model is never shown search results at all — it only
// ever produces a tool call with filter arguments. The reply text an
// employer sees after a search is always a fixed, deterministic template
// ("Found N candidates matching your search"), never model-generated prose
// about the results — that is what makes "descriptive, not evaluative"
// true by construction rather than by prompting.
//
// Non-negotiable #4 (dated override, 2026-08-26): search results show
// name, current job title, and location pre-shortlist. Photo, video, and
// CV file stay excluded — candidate_search (migration 0013) only ever
// selects the fields this override actually covers.
//
// Candidate posts (migration 0015, added 2026-08-26 same session): a
// candidate's own free-form stories/opinions are now full-text searchable
// and AI-summarizable in chat, per founder decision. This does NOT relax
// the guardrail above — the employer's raw message still goes through
// checkProtectedCharacteristics() before the model is ever called,
// regardless of which tool argument ends up encoding the request, so
// "find someone who posted about X protected characteristic" is blocked
// exactly like a structured-field version of the same request. What's new
// is stage 3 below: an ISOLATED per-candidate summarization call — one
// candidate's post text only, no other candidate's data in context, no
// comparison across candidates — kept structurally incapable of the kind
// of comparative/evaluative language a single combined-results call could
// produce. It is asked to describe, never to judge.

const AVAILABILITY_STATES = ["available_now", "available_from", "open_to_offers", "not_looking"] as const;

// Sprint 9 (partial, added same day as Sprint 8): shortlist + fixed
// pipeline, via chat. stage is text + check-constrained in the DB (migration
// 0016), not a native enum, specifically so the list below can be extended
// later with a single constraint swap — founder asked for "provisions to
// add more stages later" when confirming this fixed list.
//
// Sprint 14 (2026-08-30): migrated from the original five-value list
// (shortlisted/interview/offer/hired/rejected) to the six-stage model the
// workflow handover, wireframes, and Next.js lib/types.ts all independently
// specify — see migration 0021 and HANDOVER.md §14 for the full
// reconciliation and the founder-confirmed value mapping.
const PIPELINE_STAGES = [
  "shortlisted",
  "invited_for_interview",
  "pending_interview_result",
  "successful",
  "rejected",
  "onboarding",
] as const;

const PIPELINE_STAGE_LABEL: Record<string, string> = {
  shortlisted: "Shortlisted",
  invited_for_interview: "Invited for Interview",
  pending_interview_result: "Pending Interview Result",
  successful: "Successful",
  rejected: "Rejected",
  onboarding: "Onboarding",
};

const SEARCH_TOOL = {
  name: "search_candidates",
  description:
    "Search published, verified candidates by job-relevant criteria only: profession, clinical skills, location, travel radius, availability, minimum experience, qualification level, and — optionally — a topic to look for in candidates' own posts/stories. " +
    "There is no field for age, sex, race, religion, disability, sexual orientation, or any other personal characteristic — never attempt to encode one here.",
  parameters: {
    type: "object",
    required: [],
    properties: {
      profession_id: { type: "string", description: "A single profession id from the allowed list in the system prompt, if the employer named a specific role." },
      skill_ids: { type: "array", items: { type: "string" }, description: "Clinical skill ids from the allowed list, if the employer named specific skills or clinical experience." },
      town: { type: "string", description: "Town or city to search near, if the employer named a location." },
      max_travel_radius_miles: { type: "number", description: "Maximum travel radius in miles, only if explicitly mentioned." },
      availability: { type: "string", description: "One of available_now, available_from, open_to_offers, not_looking — only if explicitly mentioned." },
      min_experience_years: { type: "number", description: "Minimum total years of experience, only if the employer gave a number (e.g. '5 years experience')." },
      qualification_type_id: { type: "string", description: "A single qualification type id from the allowed list, only if the employer named a specific qualification or level (e.g. a Level 2 or Level 3 diploma)." },
      post_topic: { type: "string", description: "A short keyword or topic to look for in candidates' own posts/stories, only if the employer explicitly asked to read about a specific experience, opinion, or story — never a personal characteristic." },
    },
  },
};

// Sprint 14 (2026-08-30): the old single shortlist_candidates action is now
// two distinct tools, per the workflow handover §2 — "Two distinct save
// actions, not one." Bookmark is private and has no consequence for the
// candidate; Send Invite is the real consent-request event and requires a
// job.
const BOOKMARK_TOOL = {
  name: "bookmark_candidates",
  description:
    "Privately save candidates from the MOST RECENT search results in this conversation for later comparison, taken strictly in the order the search returned them — never chosen by judgment. " +
    "This is NOT an invite: it creates no pipeline entry, sends the candidate no notification, and has zero effect on their searchability — they stay fully visible to every search, including this employer's own future ones. " +
    "Use this when the employer asks to bookmark, save, or shortlist-for-comparison candidates just shown, as distinct from actually inviting them to a role.",
  parameters: {
    type: "object",
    required: [],
    properties: {
      count: { type: "number", description: "How many candidates to bookmark, in the order the last search returned them. Omit if the employer said 'all'." },
      all: { type: "boolean", description: "True if the employer asked to bookmark all of the last search results." },
    },
  },
};

const SEND_INVITE_TOOL = {
  name: "send_invite",
  description:
    "Send an invite for a specific job to candidates from the MOST RECENT search results in this conversation, taken strictly in the order the search returned them — never chosen by judgment. " +
    "This is the real commitment: it creates a pipeline entry at the Shortlisted stage for that job, notifies the candidate, and excludes them from this employer's future searches for that role while the pipeline stays open. " +
    "Requires a job_id copied exactly from the employer's own active jobs listed in the system prompt — never invent one; if nothing matches what the employer described, ask them to confirm which job, or tell them a job needs creating first. " +
    "Use this when the employer asks to invite, shortlist-for-a-role, or send an invite to some or all of the candidates just shown.",
  parameters: {
    type: "object",
    required: ["job_id"],
    properties: {
      job_id: { type: "string", description: "The job's id, copied exactly from the employer's active jobs list in the system prompt." },
      count: { type: "number", description: "How many candidates to invite, in the order the last search returned them. Omit if the employer said 'all'." },
      all: { type: "boolean", description: "True if the employer asked to invite all of the last search results." },
    },
  },
};

// Sprint 14: keyed by pipeline_id (the shortlists row id), not candidate_id
// — a candidate can now legitimately sit in more than one of this
// employer's pipelines at once (one per job, see the jobs module),
// so candidate_id alone is no longer unambiguous.
const MOVE_STAGE_TOOL = {
  name: "move_candidate_stage",
  description:
    "Move one pipeline entry to a different stage. Only use a pipeline_id copied exactly from the employer's current pipeline list in the system prompt — never invent or guess one, and never use a candidate_id in its place, since one candidate can have more than one pipeline (one per job).",
  parameters: {
    type: "object",
    required: ["pipeline_id", "stage"],
    properties: {
      pipeline_id: { type: "string", description: "The pipeline entry's id, copied exactly from the pipeline list in the system prompt." },
      stage: { type: "string", enum: PIPELINE_STAGES as unknown as string[], description: "The stage to move it to." },
    },
  },
};

const PIPELINE_STATUS_TOOL = {
  name: "get_pipeline_status",
  description: "Report how many candidates the employer currently has at each pipeline stage. Use this when the employer asks about their pipeline, shortlist, or how many candidates are at a given stage.",
  parameters: { type: "object", required: [], properties: {} },
};

// SPRINTS.md Sprint 10 — "Who is [name]" AI summary. Deliberately v1-scoped
// to structured profile data only (experience, skills, qualifications,
// employment history, self-expression prompts) — candidate posts are
// intentionally NOT included here even though they now exist (added same
// day as Sprint 8), since synthesizing a candidate's own narrative posts
// into a combined "who is this person" summary is a materially different,
// more evaluative-shaped framing than the isolated single-post excerpt
// search already does, and deserves its own compliance look before it's
// folded in — not a decision to make silently inside an unrelated sprint.
const WHO_IS_TOOL = {
  name: "who_is_summary",
  description:
    "Give a factual, descriptive summary of one shortlisted-and-consented candidate's profile (experience, skills, qualifications, employment history, their own prompt answers). " +
    "Only use a candidate_id from the employer's current pipeline list in the system prompt, and only for a candidate marked consented there — never invent one, never use it for a candidate who hasn't consented.",
  parameters: {
    type: "object",
    required: ["candidate_id"],
    properties: {
      candidate_id: { type: "string", description: "The candidate's id, copied exactly from the pipeline list in the system prompt." },
    },
  },
};

// SPRINTS.md Sprint 11 — bulk chat commands. Same non-evaluative-selection
// principle as shortlist_candidates: a compound command like "send an
// offer to everyone successful in the last two weeks" selects by stage +
// how recently they reached it, never by the model judging who's "ready" —
// the actual filter is a deterministic SQL condition, not a model opinion.
const BULK_MOVE_STAGE_TOOL = {
  name: "bulk_move_stage",
  description:
    "Move every candidate currently at one pipeline stage to another, all at once. Use for compound commands like 'move everyone in interview to offer' or 'send an offer to everyone successful in the last two weeks' (successful/interview here means the from_stage). " +
    "Selection is always by stage (and optionally how recently they reached it) — never by picking specific individuals.",
  parameters: {
    type: "object",
    required: ["from_stage", "to_stage"],
    properties: {
      from_stage: { type: "string", enum: PIPELINE_STAGES as unknown as string[], description: "The stage candidates are currently at." },
      to_stage: { type: "string", enum: PIPELINE_STAGES as unknown as string[], description: "The stage to move them to." },
      since_days: { type: "number", description: "Only include candidates who reached from_stage within this many days (e.g. 14 for 'in the last two weeks'). Omit to include everyone at that stage regardless of when." },
    },
  },
};

const WHO_IS_SUMMARY_SYSTEM_PROMPT =
  "You are given one candidate's structured profile data, in isolation — no other candidate's data, no comparison. Write a short, factual, descriptive summary (3-5 sentences) of their experience, skills, qualifications, and what they've said about themselves. " +
  "Quote or paraphrase what's actually there. Never evaluate, rate, rank, or recommend — never say or imply they are a 'strong candidate', a 'good fit', 'ideal', 'impressive', or similar, and never comment on whether they'd be a good hire. Describe, don't judge. " +
  "Never comment on any personal characteristic not directly job-relevant. Respond with only the summary, no other text.";

const POST_SUMMARY_SYSTEM_PROMPT =
  "You are shown one care worker's own post from their professional profile, in isolation — you have no other information about them or any other candidate. " +
  "Write one short, factual, neutral sentence (max 30 words) describing what the post is about. Quote or paraphrase the content itself; do not add opinion. " +
  "Never evaluate, rate, rank, or comment on whether this person would be a good hire, and never comment on any personal characteristic. Respond with only that one sentence, no other text.";

function truncateExcerpt(text: string, max = 160): string {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trim() + "…" : trimmed;
}

// Deterministic fallback for who_is_summary — used whenever the model
// errors out AND whenever containsEvaluativeLanguage() flags its output,
// so an evaluative response never reaches the employer just because the
// model didn't follow the system prompt this one time.
function buildFallbackSummary(name: string, dossier: unknown): string {
  const d = (dossier || {}) as Record<string, unknown>;
  const professions = Array.isArray(d.professions) ? (d.professions as string[]) : [];
  const skills = Array.isArray(d.skills) ? (d.skills as string[]) : [];
  const months = typeof d.experience_months === "number" ? d.experience_months : 0;
  const years = Math.floor(months / 12);

  const parts: string[] = [`${name}${professions.length ? " — " + professions.join(", ") : ""}.`];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"} of experience.`);
  if (skills.length) parts.push(`Skills: ${skills.join(", ")}.`);
  return parts.length > 1 ? parts.join(" ") : `${name}'s profile is on file but has limited detail entered.`;
}

async function saveAssistantMessage(
  supabase: SupabaseClient,
  employerId: string,
  content: string,
  extra?: { tool_call?: unknown; result_count?: number; results_snapshot?: unknown },
) {
  const { data } = await supabase
    .from("employer_chat_messages")
    .insert({ employer_id: employerId, role: "assistant", content, ...extra })
    .select()
    .single();
  return data;
}

employerChat.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return c.json({ error: "message is required" }, 400);
  if (message.length > 2000) return c.json({ error: "Message is too long" }, 400);

  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const { data: verified } = await supabase.rpc("is_verified_employer");
  if (!verified) {
    return c.json({ error: "Your organisation needs to be verified before you can search" }, 403);
  }

  await supabase.from("employer_chat_messages").insert({ employer_id: userId, role: "user", content: message });

  const guardrail = checkProtectedCharacteristics(message);
  if (guardrail.blocked) {
    // tool_call: { blocked: true } is a marker, not a real tool call — lets
    // both the live response and history replay (GET / below) tell the
    // frontend to render this with the distinct guardrail styling instead
    // of a plain assistant bubble (a real UX gap found during a debugging
    // pass: the CSS class existed, nothing ever applied it).
    const assistantRow = await saveAssistantMessage(supabase, userId, GUARDRAIL_REDIRECT_MESSAGE, { tool_call: { blocked: true } });
    return c.json({ reply: GUARDRAIL_REDIRECT_MESSAGE, results: null, message_id: assistantRow?.id, blocked: true });
  }

  // Recent history for conversational continuity. Safe to replay to the
  // model: assistant messages here are always either the fixed
  // guardrail/search-summary templates or a plain conversational reply —
  // never raw candidate data — so this never leaks anything the model
  // wasn't already allowed to produce itself.
  const { data: history } = await supabase
    .from("employer_chat_messages")
    .select("role, content")
    .eq("employer_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  const recentMessages = (history || []).reverse().map((m) => ({ role: m.role as string, content: m.content as string }));

  const [professionsResult, skillsResult, qualTypesResult, pipelineResult, jobsResult] = await Promise.all([
    supabase.from("professions").select("id, name, family"),
    supabase.from("clinical_skills").select("id, label, family"),
    supabase.from("qualification_types").select("id, label"),
    supabase.from("shortlists").select("id, candidate_id, job_id, job_snapshot, stage, candidate_consented_at").eq("employer_id", userId),
    // Sprint 14: active jobs, the catalogue send_invite resolves job_id
    // against — never trust a model-supplied job_id without checking it's
    // one of this employer's own active jobs, same pattern as profession/
    // skill/qualification ids below.
    supabase.from("jobs").select("*").eq("employer_id", userId).eq("status", "active"),
  ]);
  const professionIds = new Set((professionsResult.data || []).map((p) => p.id));
  const skillIds = new Set((skillsResult.data || []).map((s) => s.id));
  const qualTypeIds = new Set((qualTypesResult.data || []).map((q) => q.id));
  const professionCatalogue = (professionsResult.data || []).map((p) => `${p.id}: ${p.name} (${p.family})`).join("\n");
  const skillCatalogue = (skillsResult.data || []).map((s) => `${s.id}: ${s.label} (${s.family})`).join("\n");
  const qualTypeCatalogue = (qualTypesResult.data || []).map((q) => `${q.id}: ${q.label}`).join("\n");

  const activeJobs = jobsResult.data || [];
  const jobsById = new Map(activeJobs.map((j) => [j.id as string, j]));
  const jobsCatalogue =
    activeJobs.map((j) => `${j.id}: ${j.title} (${j.location})`).join("\n") ||
    "(no active jobs yet — the employer needs to create one before you can send an invite)";

  const pipelineRows = pipelineResult.data || [];
  // Sprint 14: keyed by pipeline row id (r.id), not candidate_id — a
  // candidate can now sit in more than one of this employer's pipelines at
  // once (one per job), so candidate_id alone can't address a single
  // pipeline entry unambiguously any more.
  const pipelineById = new Map(pipelineRows.map((r) => [r.id as string, r]));
  const pipelineCandidateIdSet = new Set(pipelineRows.map((r) => r.candidate_id as string));
  const pipelineNameById = new Map<string, string>();
  if (pipelineCandidateIdSet.size) {
    const { data: pipelineCandidates } = await supabase
      .from("candidate_search")
      .select("id, full_name")
      .in("id", Array.from(pipelineCandidateIdSet));
    for (const pc of pipelineCandidates || []) pipelineNameById.set(pc.id, pc.full_name);
  }
  const pipelineConsentedById = new Map<string, boolean>();
  for (const r of pipelineRows) pipelineConsentedById.set(r.candidate_id as string, !!r.candidate_consented_at);
  const pipelineCatalogue =
    pipelineRows
      .map((r) => {
        const jobTitle = (r.job_snapshot as { title?: string } | null)?.title;
        const stageLabel = PIPELINE_STAGE_LABEL[r.stage as string] || (r.stage as string);
        return `${r.id}: ${pipelineNameById.get(r.candidate_id as string) || "Candidate"}${jobTitle ? " — " + jobTitle : ""} (${stageLabel}${r.candidate_consented_at ? ", consented" : ""})`;
      })
      .join("\n") || "(empty — nobody invited yet)";

  const systemPrompt =
    "You help a verified UK healthcare/social-care employer search for and manage candidates on iCare, entirely by calling one of seven tools: search_candidates, bookmark_candidates, send_invite, move_candidate_stage, bulk_move_stage, get_pipeline_status, who_is_summary. " +
    "You never see or judge candidate data yourself — you only translate the employer's request into the right tool call; the platform runs the actual query or update. " +
    "Only use profession_id/skill_ids/qualification_type_id from the allowed lists below — never invent one. " +
    "If the employer's message doesn't match any of these actions (a greeting, a question about how this works), reply conversationally and briefly instead of calling a tool — never claim to know about specific candidates or their pipeline without calling the right tool. " +
    "post_topic searches candidates' own posts/stories — use it only when the employer explicitly asks to read about a specific experience, opinion, or story, never to look for a personal characteristic. " +
    "bookmark_candidates and send_invite both take from the MOST RECENT search results in this conversation, in the order returned — never pick specific individuals by judgment — but they are NOT interchangeable: bookmark_candidates is private, has no job, and has no effect on the candidate at all; send_invite is the real consent-request event, always needs a job_id from the active jobs list below, and is what actually creates a pipeline entry. If the employer just says \"shortlist\" or \"save\" without clearly meaning an actual invite, prefer bookmark_candidates and ask if they meant to invite instead. " +
    "move_candidate_stage, bulk_move_stage, and get_pipeline_status act on the employer's current pipeline, listed below — only ever describe or move candidates neutrally, never add opinion about any of them (no \"strong candidate\", \"good fit\", or similar, ever). move_candidate_stage takes a pipeline_id, never a candidate_id — a candidate can have more than one pipeline (one per job). " +
    "bulk_move_stage selects candidates by stage (and optionally how long they've been there) only — never by name or by judging who's ready. " +
    "who_is_summary gives a descriptive profile summary — only for a candidate marked \"consented\" in the pipeline list below; if the employer asks about someone not marked consented, explain they haven't consented to share more detail yet, don't call the tool. " +
    "Never ask for, accept, or act on age, sex, race, religion, disability, sexual orientation, nationality, or any other personal characteristic — if a request implies one, decline that part and search only on what's left (profession, skills, location, availability, experience, qualification, post topic).\n\n" +
    "Allowed professions (id: name (family)):\n" + professionCatalogue + "\n\n" +
    "Allowed clinical skills (id: label (family)):\n" + skillCatalogue + "\n\n" +
    "Allowed qualification types (id: label):\n" + qualTypeCatalogue + "\n\n" +
    "Pipeline stages, in order: " + PIPELINE_STAGES.map((s) => PIPELINE_STAGE_LABEL[s]).join(", ") + "\n\n" +
    "Employer's active jobs, for send_invite's job_id (id: title (location)):\n" + jobsCatalogue + "\n\n" +
    "Employer's current pipeline (pipeline_id: candidate name — job title (stage[, consented])):\n" + pipelineCatalogue;

  let toolCall: { name?: string; arguments?: Record<string, unknown> } | undefined;
  let modelReply = "";
  try {
    const result = await c.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [{ role: "system", content: systemPrompt }, ...recentMessages],
      tools: [SEARCH_TOOL, BOOKMARK_TOOL, SEND_INVITE_TOOL, MOVE_STAGE_TOOL, BULK_MOVE_STAGE_TOOL, PIPELINE_STATUS_TOOL, WHO_IS_TOOL],
      max_tokens: 600,
    });
    if (typeof result === "object" && result !== null) {
      const r = result as { response?: string; tool_calls?: { name?: string; arguments?: Record<string, unknown> }[] };
      modelReply = r.response || "";
      toolCall = r.tool_calls?.[0];
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Search failed";
    const fallback = "Something went wrong running that search — please try again.";
    const assistantRow = await saveAssistantMessage(supabase, userId, fallback);
    return c.json({ error: errorMessage, reply: fallback, message_id: assistantRow?.id }, 500);
  }

  if (!toolCall) {
    const reply = modelReply || "I'm not sure what you're looking for — try describing the role, skills, or location you need.";
    const assistantRow = await saveAssistantMessage(supabase, userId, reply);
    return c.json({ reply, results: null, message_id: assistantRow?.id });
  }

  // Sprint 14: shortlist_candidates split into bookmark_candidates (private,
  // no job, no pipeline) and send_invite (job-gated, creates the pipeline
  // entry). Both still take "the most recent search results, in order" —
  // same non-evaluative-selection principle as before, just applied twice.
  if (toolCall.name === "bookmark_candidates") {
    const { data: lastSearch } = await supabase
      .from("employer_chat_messages")
      .select("results_snapshot")
      .eq("employer_id", userId)
      .eq("role", "assistant")
      .not("results_snapshot", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastResults = (lastSearch?.results_snapshot as { id: string }[] | null) || [];
    if (lastResults.length === 0) {
      const reply = "You don't have a recent search to bookmark from — try searching for candidates first.";
      const assistantRow = await saveAssistantMessage(supabase, userId, reply);
      return c.json({ reply, results: null, message_id: assistantRow?.id });
    }

    const bookmarkArgs = toolCall.arguments || {};
    const wantAll = bookmarkArgs.all === true;
    const requestedCount = typeof bookmarkArgs.count === "number" && bookmarkArgs.count > 0 ? Math.floor(bookmarkArgs.count) : null;
    const take = wantAll ? lastResults.length : requestedCount || lastResults.length;
    const candidateIds = lastResults.slice(0, take).map((r) => r.id);

    const { data: inserted, error: bookmarkError } = await supabase
      .from("bookmarks")
      .upsert(
        candidateIds.map((candidate_id) => ({ employer_id: userId, candidate_id })),
        { onConflict: "employer_id,candidate_id", ignoreDuplicates: true },
      )
      .select("candidate_id");
    if (bookmarkError) return c.json({ error: bookmarkError.message }, 400);

    const insertedCount = inserted?.length || 0;
    const alreadyCount = candidateIds.length - insertedCount;
    const reply =
      insertedCount === 0
        ? `All ${candidateIds.length} of those were already bookmarked.`
        : `Bookmarked ${insertedCount} candidate${insertedCount === 1 ? "" : "s"}` +
          (alreadyCount > 0 ? ` (${alreadyCount} were already bookmarked)` : "") +
          ". This is private — they haven't been notified and are still fully searchable. Say \"invite them\" when you're ready to actually reach out for a specific role.";

    const assistantRow = await saveAssistantMessage(supabase, userId, reply, {
      tool_call: { count: requestedCount, all: wantAll },
      result_count: insertedCount,
    });
    return c.json({ reply, results: null, message_id: assistantRow?.id });
  }

  if (toolCall.name === "send_invite") {
    const inviteArgs = toolCall.arguments || {};
    const jobId = typeof inviteArgs.job_id === "string" ? inviteArgs.job_id : null;
    const job = jobId ? jobsById.get(jobId) : undefined;
    if (!jobId || !job) {
      const reply =
        activeJobs.length === 0
          ? "You don't have any active jobs yet — create one first, then I can send invites against it."
          : "I couldn't match that to one of your active jobs — try naming the role again, or ask to see your jobs list.";
      const assistantRow = await saveAssistantMessage(supabase, userId, reply);
      return c.json({ reply, results: null, message_id: assistantRow?.id });
    }

    const { data: lastSearch } = await supabase
      .from("employer_chat_messages")
      .select("results_snapshot")
      .eq("employer_id", userId)
      .eq("role", "assistant")
      .not("results_snapshot", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastResults = (lastSearch?.results_snapshot as { id: string }[] | null) || [];
    if (lastResults.length === 0) {
      const reply = "You don't have a recent search to invite from — try searching for candidates first.";
      const assistantRow = await saveAssistantMessage(supabase, userId, reply);
      return c.json({ reply, results: null, message_id: assistantRow?.id });
    }

    const wantAll = inviteArgs.all === true;
    const requestedCount = typeof inviteArgs.count === "number" && inviteArgs.count > 0 ? Math.floor(inviteArgs.count) : null;
    const take = wantAll ? lastResults.length : requestedCount || lastResults.length;
    const candidateIds = lastResults.slice(0, take).map((r) => r.id);

    // Snapshot the job as it stands right now — workflow handover §3: a
    // later edit to pay/hours must not retroactively change what a
    // candidate is deemed to have consented to.
    const jobSnapshot = { ...job, snapshot_taken_at: new Date().toISOString() };

    const { data: inserted, error: inviteError } = await supabase
      .from("shortlists")
      .upsert(
        candidateIds.map((candidate_id) => ({ employer_id: userId, candidate_id, job_id: jobId, job_snapshot: jobSnapshot })),
        { onConflict: "employer_id,candidate_id,job_id", ignoreDuplicates: true },
      )
      .select("candidate_id");
    if (inviteError) return c.json({ error: inviteError.message }, 400);

    const insertedCount = inserted?.length || 0;
    const alreadyCount = candidateIds.length - insertedCount;
    const reply =
      insertedCount === 0
        ? `All ${candidateIds.length} of those already have an invite for ${job.title}.`
        : `Sent an invite for ${job.title} to ${insertedCount} candidate${insertedCount === 1 ? "" : "s"}` +
          (alreadyCount > 0 ? ` (${alreadyCount} already had one)` : "") +
          ". They're now Shortlisted in that job's pipeline — ask to see your pipeline status, or move someone to a different stage.";

    const assistantRow = await saveAssistantMessage(supabase, userId, reply, {
      tool_call: { job_id: jobId, count: requestedCount, all: wantAll },
      result_count: insertedCount,
    });
    return c.json({ reply, results: null, message_id: assistantRow?.id });
  }

  if (toolCall.name === "move_candidate_stage") {
    const moveArgs = toolCall.arguments || {};
    const pipelineId = typeof moveArgs.pipeline_id === "string" ? moveArgs.pipeline_id : null;
    const stage = typeof moveArgs.stage === "string" && (PIPELINE_STAGES as readonly string[]).includes(moveArgs.stage) ? moveArgs.stage : null;
    const pipelineRow = pipelineId ? pipelineById.get(pipelineId) : undefined;

    if (!pipelineId || !stage || !pipelineRow) {
      const reply = "I couldn't match that to an entry in your current pipeline — try naming them again, or ask to see your pipeline first.";
      const assistantRow = await saveAssistantMessage(supabase, userId, reply);
      return c.json({ reply, results: null, message_id: assistantRow?.id });
    }

    const { error: moveError } = await supabase
      .from("shortlists")
      .update({ stage, stage_updated_at: new Date().toISOString() })
      .eq("id", pipelineId)
      .eq("employer_id", userId);
    if (moveError) return c.json({ error: moveError.message }, 400);

    const candidateName = pipelineNameById.get(pipelineRow.candidate_id as string) || "the candidate";
    const reply = `Moved ${candidateName} to ${PIPELINE_STAGE_LABEL[stage] || stage}.`;
    const assistantRow = await saveAssistantMessage(supabase, userId, reply, { tool_call: { pipeline_id: pipelineId, stage } });
    return c.json({ reply, results: null, message_id: assistantRow?.id });
  }

  if (toolCall.name === "bulk_move_stage") {
    const bulkArgs = toolCall.arguments || {};
    const fromStage = typeof bulkArgs.from_stage === "string" && (PIPELINE_STAGES as readonly string[]).includes(bulkArgs.from_stage) ? bulkArgs.from_stage : null;
    const toStage = typeof bulkArgs.to_stage === "string" && (PIPELINE_STAGES as readonly string[]).includes(bulkArgs.to_stage) ? bulkArgs.to_stage : null;
    const sinceDays = typeof bulkArgs.since_days === "number" && bulkArgs.since_days > 0 ? bulkArgs.since_days : null;

    if (!fromStage || !toStage) {
      const reply = "I need both a valid 'from' and 'to' stage to move a group of candidates — try again naming both.";
      const assistantRow = await saveAssistantMessage(supabase, userId, reply);
      return c.json({ reply, results: null, message_id: assistantRow?.id });
    }

    let bulkQuery = supabase
      .from("shortlists")
      .update({ stage: toStage, stage_updated_at: new Date().toISOString() })
      .eq("employer_id", userId)
      .eq("stage", fromStage);
    if (sinceDays) {
      const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
      bulkQuery = bulkQuery.gte("stage_updated_at", cutoff);
    }

    const { data: moved, error: bulkError } = await bulkQuery.select("candidate_id");
    if (bulkError) return c.json({ error: bulkError.message }, 400);

    const movedCount = moved?.length || 0;
    const reply =
      movedCount === 0
        ? `Nobody at "${PIPELINE_STAGE_LABEL[fromStage] || fromStage}"${sinceDays ? ` in the last ${sinceDays} days` : ""} to move.`
        : `Moved ${movedCount} candidate${movedCount === 1 ? "" : "s"} from ${PIPELINE_STAGE_LABEL[fromStage] || fromStage} to ${PIPELINE_STAGE_LABEL[toStage] || toStage}.`;

    const assistantRow = await saveAssistantMessage(supabase, userId, reply, {
      tool_call: { from_stage: fromStage, to_stage: toStage, since_days: sinceDays },
      result_count: movedCount,
    });
    return c.json({ reply, results: null, message_id: assistantRow?.id });
  }

  if (toolCall.name === "get_pipeline_status") {
    const counts: Record<string, number> = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0]));
    for (const r of pipelineRows) {
      const stage = r.stage as string;
      if (stage in counts) counts[stage] += 1;
    }
    const total = pipelineRows.length;
    const reply =
      total === 0
        ? "Your pipeline is empty — search for candidates and send some invites to get started."
        : `Your pipeline (${total} total): ` + PIPELINE_STAGES.map((s) => `${counts[s]} ${PIPELINE_STAGE_LABEL[s]}`).join(", ") + ".";

    const assistantRow = await saveAssistantMessage(supabase, userId, reply, { result_count: total });
    return c.json({ reply, results: null, message_id: assistantRow?.id });
  }

  if (toolCall.name === "who_is_summary") {
    const whoArgs = toolCall.arguments || {};
    const candidateId = typeof whoArgs.candidate_id === "string" ? whoArgs.candidate_id : null;

    if (!candidateId || !pipelineCandidateIdSet.has(candidateId) || !pipelineConsentedById.get(candidateId)) {
      const reply = "I can only summarize a candidate's profile once they've consented to share more detail — check your pipeline, or ask them to consent first.";
      const assistantRow = await saveAssistantMessage(supabase, userId, reply);
      return c.json({ reply, results: null, message_id: assistantRow?.id });
    }

    const { data: dossier, error: dossierError } = await supabase.rpc("get_candidate_dossier", { p_candidate_id: candidateId });
    if (dossierError) return c.json({ error: dossierError.message }, 400);

    const candidateName = pipelineNameById.get(candidateId) || "This candidate";
    let summary = buildFallbackSummary(candidateName, dossier);
    try {
      const summaryResult = await c.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: WHO_IS_SUMMARY_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(dossier) },
        ],
        max_tokens: 400,
      });
      const text =
        typeof summaryResult === "object" && summaryResult !== null && "response" in summaryResult
          ? (summaryResult as { response?: string }).response
          : undefined;
      if (text && text.trim() && !containsEvaluativeLanguage(text)) {
        summary = text.trim();
      }
    } catch {
      // Fall back to the deterministic summary already assigned above.
    }

    const assistantRow = await saveAssistantMessage(supabase, userId, summary, { tool_call: { candidate_id: candidateId } });
    return c.json({ reply: summary, results: null, message_id: assistantRow?.id });
  }

  if (toolCall.name !== "search_candidates") {
    const reply = modelReply || "I'm not sure what you're looking for — try describing the role, skills, or location you need.";
    const assistantRow = await saveAssistantMessage(supabase, userId, reply);
    return c.json({ reply, results: null, message_id: assistantRow?.id });
  }

  // Never trust returned ids without checking them against the real
  // reference data — same defense-in-depth pattern as CV import's
  // sanitizeParsed(), for the same reason: a model's tool-call arguments
  // aren't guaranteed valid just because the schema asked nicely.
  const args = toolCall.arguments || {};
  const professionId = typeof args.profession_id === "string" && professionIds.has(args.profession_id) ? args.profession_id : null;
  const requestedSkillIds = Array.isArray(args.skill_ids)
    ? args.skill_ids.filter((id): id is string => typeof id === "string" && skillIds.has(id))
    : [];
  const town = typeof args.town === "string" && args.town.trim() ? args.town.trim() : null;
  const maxRadius = typeof args.max_travel_radius_miles === "number" && args.max_travel_radius_miles > 0 ? args.max_travel_radius_miles : null;
  const availability =
    typeof args.availability === "string" && (AVAILABILITY_STATES as readonly string[]).includes(args.availability)
      ? args.availability
      : null;
  const minExperienceYears = typeof args.min_experience_years === "number" && args.min_experience_years > 0 ? args.min_experience_years : null;
  const qualificationTypeId =
    typeof args.qualification_type_id === "string" && qualTypeIds.has(args.qualification_type_id) ? args.qualification_type_id : null;
  const postTopic = typeof args.post_topic === "string" && args.post_topic.trim() ? args.post_topic.trim().slice(0, 200) : null;

  // Post matching runs first (not just as a post-filter on candidate_search's
  // results) so a post_topic search isn't silently limited to whichever
  // arbitrary 25 candidates candidate_search happened to return first when
  // no other filter was given.
  const postByCandidateId = new Map<string, { id: number; title: string | null; body: string }>();
  if (postTopic) {
    const { data: postMatches } = await supabase
      .from("candidate_post_search")
      .select("id, candidate_id, title, body")
      .ilike("body", `%${postTopic}%`)
      .limit(50);
    for (const p of postMatches || []) {
      if (!postByCandidateId.has(p.candidate_id)) postByCandidateId.set(p.candidate_id, { id: p.id, title: p.title, body: p.body });
    }
  }

  let results: Record<string, unknown>[] = [];
  if (!postTopic || postByCandidateId.size > 0) {
    let query = supabase.from("candidate_search").select("*");
    if (professionId) query = query.contains("profession_ids", [professionId]);
    if (requestedSkillIds.length) query = query.contains("skill_ids", requestedSkillIds);
    if (town) query = query.ilike("town", `%${town}%`);
    if (maxRadius) query = query.lte("travel_radius_miles", maxRadius);
    if (availability) query = query.eq("availability", availability);
    if (minExperienceYears) query = query.gte("experience_months", minExperienceYears * 12);
    if (qualificationTypeId) query = query.contains("qualification_type_ids", [qualificationTypeId]);
    if (postTopic) query = query.in("id", Array.from(postByCandidateId.keys()));

    const { data, error: searchError } = await query.limit(25);
    if (searchError) return c.json({ error: searchError.message }, 400);
    results = data || [];
  }

  // Stage 3: isolated per-candidate summarization, capped at 5 calls. Each
  // call sees only that one candidate's post text — never another
  // candidate's data, never a comparison — see the comment block above
  // SEARCH_TOOL for why that isolation is the point, not an optimization.
  if (postTopic && results.length) {
    const toSummarize = results.filter((r) => postByCandidateId.has(r.id as string)).slice(0, 5);
    await Promise.all(
      toSummarize.map(async (r) => {
        const post = postByCandidateId.get(r.id as string)!;
        let summary = truncateExcerpt(post.body);
        try {
          const summaryResult = await c.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
            messages: [
              { role: "system", content: POST_SUMMARY_SYSTEM_PROMPT },
              { role: "user", content: post.body.slice(0, 4000) },
            ],
            max_tokens: 80,
          });
          const text =
            typeof summaryResult === "object" && summaryResult !== null && "response" in summaryResult
              ? (summaryResult as { response?: string }).response
              : undefined;
          if (text && text.trim()) summary = text.trim();
        } catch {
          // Fall back to the deterministic truncated excerpt already assigned above.
        }
        r.post_excerpt = summary;
        r.post_id = post.id;
      }),
    );
  }

  const count = results.length;
  const reply =
    count === 0
      ? "No candidates matched that search — try widening the location, skills, profession, experience, or qualification."
      : `Found ${count} candidate${count === 1 ? "" : "s"} matching your search. Say "shortlist them" or "shortlist 10 of them" to add some to your pipeline.`;

  const assistantRow = await saveAssistantMessage(supabase, userId, reply, {
    tool_call: {
      profession_id: professionId,
      skill_ids: requestedSkillIds,
      town,
      max_travel_radius_miles: maxRadius,
      availability,
      min_experience_years: minExperienceYears,
      qualification_type_id: qualificationTypeId,
      post_topic: postTopic,
    },
    result_count: count,
    results_snapshot: results,
  });

  return c.json({ reply, results, message_id: assistantRow?.id });
});

employerChat.get("/", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("employer_chat_messages")
    .select("id, role, content, tool_call, result_count, results_snapshot, created_at")
    .eq("employer_id", c.get("userId"))
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ messages: data });
});

export default employerChat;

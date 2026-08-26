import { Hono } from "hono";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";
import { checkProtectedCharacteristics, GUARDRAIL_REDIRECT_MESSAGE } from "./employer-chat-guardrail";

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
const PIPELINE_STAGES = ["shortlisted", "interview", "offer", "hired", "rejected"] as const;

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

const SHORTLIST_TOOL = {
  name: "shortlist_candidates",
  description:
    "Add candidates from the MOST RECENT search results in this conversation to the employer's shortlist, taken strictly in the order the search returned them — never chosen by judgment. " +
    "Use this when the employer asks to shortlist some or all of the candidates just shown (e.g. 'shortlist 10 of them', 'shortlist all of them').",
  parameters: {
    type: "object",
    required: [],
    properties: {
      count: { type: "number", description: "How many candidates to shortlist, in the order the last search returned them. Omit if the employer said 'all'." },
      all: { type: "boolean", description: "True if the employer asked to shortlist all of the last search results." },
    },
  },
};

const MOVE_STAGE_TOOL = {
  name: "move_candidate_stage",
  description:
    "Move one already-shortlisted candidate to a different pipeline stage. Only use a candidate_id copied exactly from the employer's current pipeline list in the system prompt — never invent or guess one.",
  parameters: {
    type: "object",
    required: ["candidate_id", "stage"],
    properties: {
      candidate_id: { type: "string", description: "The candidate's id, copied exactly from the pipeline list in the system prompt." },
      stage: { type: "string", enum: PIPELINE_STAGES as unknown as string[], description: "The stage to move them to." },
    },
  },
};

const PIPELINE_STATUS_TOOL = {
  name: "get_pipeline_status",
  description: "Report how many candidates the employer currently has at each pipeline stage. Use this when the employer asks about their pipeline, shortlist, or how many candidates are at a given stage.",
  parameters: { type: "object", required: [], properties: {} },
};

const POST_SUMMARY_SYSTEM_PROMPT =
  "You are shown one care worker's own post from their professional profile, in isolation — you have no other information about them or any other candidate. " +
  "Write one short, factual, neutral sentence (max 30 words) describing what the post is about. Quote or paraphrase the content itself; do not add opinion. " +
  "Never evaluate, rate, rank, or comment on whether this person would be a good hire, and never comment on any personal characteristic. Respond with only that one sentence, no other text.";

function truncateExcerpt(text: string, max = 160): string {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trim() + "…" : trimmed;
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
    const assistantRow = await saveAssistantMessage(supabase, userId, GUARDRAIL_REDIRECT_MESSAGE);
    return c.json({ reply: GUARDRAIL_REDIRECT_MESSAGE, results: null, message_id: assistantRow?.id });
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

  const [professionsResult, skillsResult, qualTypesResult, pipelineResult] = await Promise.all([
    supabase.from("professions").select("id, name, family"),
    supabase.from("clinical_skills").select("id, label, family"),
    supabase.from("qualification_types").select("id, label"),
    supabase.from("shortlists").select("candidate_id, stage").eq("employer_id", userId),
  ]);
  const professionIds = new Set((professionsResult.data || []).map((p) => p.id));
  const skillIds = new Set((skillsResult.data || []).map((s) => s.id));
  const qualTypeIds = new Set((qualTypesResult.data || []).map((q) => q.id));
  const professionCatalogue = (professionsResult.data || []).map((p) => `${p.id}: ${p.name} (${p.family})`).join("\n");
  const skillCatalogue = (skillsResult.data || []).map((s) => `${s.id}: ${s.label} (${s.family})`).join("\n");
  const qualTypeCatalogue = (qualTypesResult.data || []).map((q) => `${q.id}: ${q.label}`).join("\n");

  const pipelineRows = pipelineResult.data || [];
  const pipelineCandidateIdSet = new Set(pipelineRows.map((r) => r.candidate_id as string));
  const pipelineNameById = new Map<string, string>();
  if (pipelineCandidateIdSet.size) {
    const { data: pipelineCandidates } = await supabase
      .from("candidate_search")
      .select("id, full_name")
      .in("id", Array.from(pipelineCandidateIdSet));
    for (const pc of pipelineCandidates || []) pipelineNameById.set(pc.id, pc.full_name);
  }
  const pipelineCatalogue =
    pipelineRows.map((r) => `${r.candidate_id}: ${pipelineNameById.get(r.candidate_id as string) || "Candidate"} (${r.stage})`).join("\n") ||
    "(empty — nobody shortlisted yet)";

  const systemPrompt =
    "You help a verified UK healthcare/social-care employer search for and manage candidates on iCare, entirely by calling one of four tools: search_candidates, shortlist_candidates, move_candidate_stage, get_pipeline_status. " +
    "You never see or judge candidate data yourself — you only translate the employer's request into the right tool call; the platform runs the actual query or update. " +
    "Only use profession_id/skill_ids/qualification_type_id from the allowed lists below — never invent one. " +
    "If the employer's message doesn't match any of these actions (a greeting, a question about how this works), reply conversationally and briefly instead of calling a tool — never claim to know about specific candidates or their pipeline without calling the right tool. " +
    "post_topic searches candidates' own posts/stories — use it only when the employer explicitly asks to read about a specific experience, opinion, or story, never to look for a personal characteristic. " +
    "shortlist_candidates always takes from the MOST RECENT search results in this conversation, in the order returned — never pick specific individuals by judgment. " +
    "move_candidate_stage and get_pipeline_status act on the employer's current pipeline, listed below — only ever describe or move candidates neutrally, never add opinion about any of them (no \"strong candidate\", \"good fit\", or similar, ever). " +
    "Never ask for, accept, or act on age, sex, race, religion, disability, sexual orientation, nationality, or any other personal characteristic — if a request implies one, decline that part and search only on what's left (profession, skills, location, availability, experience, qualification, post topic).\n\n" +
    "Allowed professions (id: name (family)):\n" + professionCatalogue + "\n\n" +
    "Allowed clinical skills (id: label (family)):\n" + skillCatalogue + "\n\n" +
    "Allowed qualification types (id: label):\n" + qualTypeCatalogue + "\n\n" +
    "Pipeline stages, in order: " + PIPELINE_STAGES.join(", ") + "\n\n" +
    "Employer's current pipeline (candidate_id: name (stage)):\n" + pipelineCatalogue;

  let toolCall: { name?: string; arguments?: Record<string, unknown> } | undefined;
  let modelReply = "";
  try {
    const result = await c.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [{ role: "system", content: systemPrompt }, ...recentMessages],
      tools: [SEARCH_TOOL, SHORTLIST_TOOL, MOVE_STAGE_TOOL, PIPELINE_STATUS_TOOL],
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

  if (toolCall.name === "shortlist_candidates") {
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
      const reply = "You don't have a recent search to shortlist from — try searching for candidates first.";
      const assistantRow = await saveAssistantMessage(supabase, userId, reply);
      return c.json({ reply, results: null, message_id: assistantRow?.id });
    }

    const shortlistArgs = toolCall.arguments || {};
    const wantAll = shortlistArgs.all === true;
    const requestedCount = typeof shortlistArgs.count === "number" && shortlistArgs.count > 0 ? Math.floor(shortlistArgs.count) : null;
    const take = wantAll ? lastResults.length : requestedCount || lastResults.length;
    const candidateIds = lastResults.slice(0, take).map((r) => r.id);

    const { data: inserted, error: shortlistError } = await supabase
      .from("shortlists")
      .upsert(
        candidateIds.map((candidate_id) => ({ employer_id: userId, candidate_id })),
        { onConflict: "employer_id,candidate_id", ignoreDuplicates: true },
      )
      .select("candidate_id");
    if (shortlistError) return c.json({ error: shortlistError.message }, 400);

    const insertedCount = inserted?.length || 0;
    const alreadyCount = candidateIds.length - insertedCount;
    const reply =
      insertedCount === 0
        ? `All ${candidateIds.length} of those were already on your shortlist.`
        : `Shortlisted ${insertedCount} candidate${insertedCount === 1 ? "" : "s"}` +
          (alreadyCount > 0 ? ` (${alreadyCount} were already shortlisted)` : "") +
          ". They're now in your pipeline — ask to see your pipeline status, or move someone to a different stage.";

    const assistantRow = await saveAssistantMessage(supabase, userId, reply, {
      tool_call: { count: requestedCount, all: wantAll },
      result_count: insertedCount,
    });
    return c.json({ reply, results: null, message_id: assistantRow?.id });
  }

  if (toolCall.name === "move_candidate_stage") {
    const moveArgs = toolCall.arguments || {};
    const candidateId = typeof moveArgs.candidate_id === "string" ? moveArgs.candidate_id : null;
    const stage = typeof moveArgs.stage === "string" && (PIPELINE_STAGES as readonly string[]).includes(moveArgs.stage) ? moveArgs.stage : null;

    if (!candidateId || !stage || !pipelineCandidateIdSet.has(candidateId)) {
      const reply = "I couldn't match that to someone in your current pipeline — try naming them again, or ask to see your pipeline first.";
      const assistantRow = await saveAssistantMessage(supabase, userId, reply);
      return c.json({ reply, results: null, message_id: assistantRow?.id });
    }

    const { error: moveError } = await supabase
      .from("shortlists")
      .update({ stage, stage_updated_at: new Date().toISOString() })
      .eq("employer_id", userId)
      .eq("candidate_id", candidateId);
    if (moveError) return c.json({ error: moveError.message }, 400);

    const candidateName = pipelineNameById.get(candidateId) || "the candidate";
    const reply = `Moved ${candidateName} to ${stage}.`;
    const assistantRow = await saveAssistantMessage(supabase, userId, reply, { tool_call: { candidate_id: candidateId, stage } });
    return c.json({ reply, results: null, message_id: assistantRow?.id });
  }

  if (toolCall.name === "get_pipeline_status") {
    const counts: Record<string, number> = { shortlisted: 0, interview: 0, offer: 0, hired: 0, rejected: 0 };
    for (const r of pipelineRows) {
      const stage = r.stage as string;
      if (stage in counts) counts[stage] += 1;
    }
    const total = pipelineRows.length;
    const reply =
      total === 0
        ? "Your pipeline is empty — search for candidates and shortlist some to get started."
        : `Your pipeline (${total} total): ` + PIPELINE_STAGES.map((s) => `${counts[s]} ${s}`).join(", ") + ".";

    const assistantRow = await saveAssistantMessage(supabase, userId, reply, { result_count: total });
    return c.json({ reply, results: null, message_id: assistantRow?.id });
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
    .select("id, role, content, result_count, results_snapshot, created_at")
    .eq("employer_id", c.get("userId"))
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ messages: data });
});

export default employerChat;

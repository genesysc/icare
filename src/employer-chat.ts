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

const AVAILABILITY_STATES = ["available_now", "available_from", "open_to_offers", "not_looking"] as const;

const SEARCH_TOOL = {
  name: "search_candidates",
  description:
    "Search published, verified candidates by job-relevant criteria only: profession, clinical skills, location, travel radius, and availability. " +
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
    },
  },
};

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

  const [professionsResult, skillsResult] = await Promise.all([
    supabase.from("professions").select("id, name, family"),
    supabase.from("clinical_skills").select("id, label, family"),
  ]);
  const professionIds = new Set((professionsResult.data || []).map((p) => p.id));
  const skillIds = new Set((skillsResult.data || []).map((s) => s.id));
  const professionCatalogue = (professionsResult.data || []).map((p) => `${p.id}: ${p.name} (${p.family})`).join("\n");
  const skillCatalogue = (skillsResult.data || []).map((s) => `${s.id}: ${s.label} (${s.family})`).join("\n");

  const systemPrompt =
    "You help a verified UK healthcare/social-care employer search for candidates on iCare, entirely by calling the search_candidates tool. " +
    "You never see or judge candidate data yourself — you only translate the employer's request into search filters; the platform runs the actual query. " +
    "Only use profession_id/skill_ids from the allowed lists below — never invent one. " +
    "If the employer's message doesn't describe what kind of candidate they want (a greeting, a question about how this works), reply conversationally and briefly instead of calling the tool — never claim to know about specific candidates without calling the tool. " +
    "Never ask for, accept, or act on age, sex, race, religion, disability, sexual orientation, nationality, or any other personal characteristic — if a request implies one, decline that part and search only on what's left (profession, skills, location, availability).\n\n" +
    "Allowed professions (id: name (family)):\n" + professionCatalogue + "\n\n" +
    "Allowed clinical skills (id: label (family)):\n" + skillCatalogue;

  let toolCall: { name?: string; arguments?: Record<string, unknown> } | undefined;
  let modelReply = "";
  try {
    const result = await c.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [{ role: "system", content: systemPrompt }, ...recentMessages],
      tools: [SEARCH_TOOL],
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

  if (!toolCall || toolCall.name !== "search_candidates") {
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

  let query = supabase.from("candidate_search").select("*");
  if (professionId) query = query.contains("profession_ids", [professionId]);
  if (requestedSkillIds.length) query = query.contains("skill_ids", requestedSkillIds);
  if (town) query = query.ilike("town", `%${town}%`);
  if (maxRadius) query = query.lte("travel_radius_miles", maxRadius);
  if (availability) query = query.eq("availability", availability);

  const { data: results, error: searchError } = await query.limit(25);
  if (searchError) return c.json({ error: searchError.message }, 400);

  const count = results?.length || 0;
  const reply =
    count === 0
      ? "No candidates matched that search — try widening the location, skills, or profession."
      : `Found ${count} candidate${count === 1 ? "" : "s"} matching your search.`;

  const assistantRow = await saveAssistantMessage(supabase, userId, reply, {
    tool_call: { profession_id: professionId, skill_ids: requestedSkillIds, town, max_travel_radius_miles: maxRadius, availability },
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

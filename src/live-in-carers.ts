import { Hono } from "hono";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";

// Live-in Carer Register — see supabase/migrations/20261020120000_0056.
//
// Rules this file is responsible for enforcing (the DB enforces the rest):
//   * the caller must already be a signed-in iCare member; there is no
//     anonymous/second account path (founder decision, 2026-10-20).
//   * email and full name are stamped from the authenticated account where
//     available, never trusted from the body alone.
//   * consentPrivacy must be true on create, re-checked here as well as in
//     the client. employer_view and email_alerts are separate opt-ins.
//   * a hidden profile can never receive alerts, and turning visibility to
//     hidden turns alerts off in the same write.
//   * nothing here sorts or scores: ordering is created_at/updated_at only.

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
  SENDER_FROM_NAME?: string;
  NEWS_INGEST_SECRET?: string;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
  user: User;
};

const liveIn = new Hono<{ Bindings: Bindings; Variables: Variables }>();

export const LIVE_IN_CONSENT_VERSION = "live-in-v1-2026-10-20";

const ROLES = ["care-assistant", "senior-care-worker", "nurse-hca", "other"] as const;
const EXPERIENCE = ["<1y", "1-3y", "3-5y", "5-10y", "10y+"] as const;
const LIVE_IN_EXPERIENCE = ["yes-regular", "yes-few", "no-keen"] as const;
const SPECIALISMS = ["dementia", "end-of-life", "mobility", "learning-disability", "mental-health", "childrens"] as const;
const REGIONS = ["london", "south-east", "east", "midlands", "north-west", "north-east", "south-west", "wales", "scotland", "northern-ireland"] as const;
const RADIUS = ["10", "25", "50", "100", "uk"] as const;
const BLOCKS = ["1w", "2w", "4w", "8w+", "ongoing", "short-cover"] as const;
const TIME_OFF = ["same-as-block", "half-block", "flexible"] as const;
const RATE_BASIS = ["day", "24h", "week"] as const;
const RATE_NEGOTIABLE = ["fixed", "open", "depends-on-block"] as const;
const ACCOMMODATION = ["own-room", "shared-ok"] as const;
const RTW = ["yes", "existing-visa", "no-or-unsure"] as const;
const VISIBILITY = ["public", "hidden"] as const;
const ALERT_FREQUENCY = ["as-they-happen", "weekly", "off"] as const;

type CarerInput = {
  full_name: string;
  preferred_name: string | null;
  email: string;
  phone: string;
  role: string;
  experience: string;
  live_in_experience: string;
  specialisms: string[];
  languages: string | null;
  regions: string[];
  postcode_private: string;
  postcode_area: string;
  radius: string;
  blocks: string[];
  start_date: string;
  time_off: string | null;
  rate_basis: string;
  rate_pence: number;
  rate_negotiable: string | null;
  rate_notes: string | null;
  accommodation: string;
  rtw: string;
  visibility: string;
  alert_frequency: string;
};

type ConsentInput = { privacy: boolean; employer_view: boolean; email_alerts: boolean };

function str(body: Record<string, unknown>, key: string, max = 300): string {
  const value = body[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string"))];
}

function oneOf(value: string, allowed: readonly string[]): string | null {
  return allowed.includes(value) ? value : null;
}

function optionalOneOf(value: string, allowed: readonly string[]): string | null | undefined {
  if (!value) return null;
  return allowed.includes(value) ? value : undefined;
}

function outwardCode(postcode: string): string | null {
  const cleaned = postcode.toUpperCase().replace(/\s+/g, " ").trim();
  const match = /^([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}$/.exec(cleaned);
  if (match) return match[1];
  const first = cleaned.split(" ")[0];
  return first && first.length <= 4 ? first : null;
}

// Returns either a complete, normalised payload or a field-specific error.
// Kept as one function so create and edit cannot drift apart.
function validate(body: Record<string, unknown>, user: User): { value?: CarerInput; consents?: ConsentInput; error?: string; field?: string } {
  const fullName = str(body, "fullName", 200) || (user.user_metadata?.full_name as string | undefined)?.trim() || "";
  const email = (user.email || str(body, "email", 254)).trim().toLowerCase();
  const phone = str(body, "phone", 40).replace(/[^\d+\s()-]/g, "");

  if (!fullName) return { error: "Full name is required", field: "fullName" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "A valid email is required", field: "email" };
  if (phone.replace(/\D/g, "").length < 7) return { error: "Enter a mobile number we can reach you on", field: "phone" };

  const role = oneOf(str(body, "role"), ROLES);
  if (!role) return { error: "Choose your role", field: "role" };

  const experience = oneOf(str(body, "experience"), EXPERIENCE);
  if (!experience) return { error: "Choose your years of experience", field: "experience" };

  const liveInExperience = oneOf(str(body, "liveInExperience"), LIVE_IN_EXPERIENCE);
  if (!liveInExperience) return { error: "Tell us about your live-in experience", field: "liveInExperience" };

  const specialisms = strArray(body, "specialisms");
  if (specialisms.some((item) => !SPECIALISMS.includes(item as (typeof SPECIALISMS)[number]))) {
    return { error: "Unknown specialism", field: "specialisms" };
  }

  const regions = strArray(body, "regions");
  if (regions.length === 0) return { error: "Choose at least one region", field: "regions" };
  if (regions.some((item) => !REGIONS.includes(item as (typeof REGIONS)[number]))) {
    return { error: "Unknown region", field: "regions" };
  }

  const postcode = str(body, "postcode", 12);
  const area = outwardCode(postcode);
  if (!area) return { error: "Enter a valid UK postcode, e.g. EN3 4HY", field: "postcode" };

  const radius = oneOf(str(body, "radius"), RADIUS);
  if (!radius) return { error: "Choose how far you'll travel", field: "radius" };

  const blocks = strArray(body, "blocks");
  if (blocks.length === 0) return { error: "Choose at least one block length", field: "blocks" };
  if (blocks.some((item) => !BLOCKS.includes(item as (typeof BLOCKS)[number]))) {
    return { error: "Unknown block length", field: "blocks" };
  }

  const startDate = str(body, "startDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate))) {
    return { error: "Choose your earliest start date", field: "startDate" };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (startDate < today) return { error: "Start date cannot be in the past", field: "startDate" };

  const timeOff = optionalOneOf(str(body, "timeOff"), TIME_OFF);
  if (timeOff === undefined) return { error: "Unknown time-off option", field: "timeOff" };

  const rateBasis = oneOf(str(body, "rateBasis"), RATE_BASIS);
  if (!rateBasis) return { error: "Choose how you charge", field: "rateBasis" };

  const rateText = str(body, "rateAmount", 12);
  const rateRaw = typeof body.rateAmount === "number" ? body.rateAmount : Number(rateText);
  if (rateText === "" && typeof body.rateAmount !== "number") {
    return { error: "Enter your rate", field: "rateAmount" };
  }
  if (!Number.isFinite(rateRaw) || rateRaw < 0 || rateRaw > 100000) {
    return { error: "Enter a rate between £0 and £100,000", field: "rateAmount" };
  }
  const ratePence = Math.round(rateRaw * 100);

  const rateNegotiable = optionalOneOf(str(body, "rateNegotiable"), RATE_NEGOTIABLE);
  if (rateNegotiable === undefined) return { error: "Unknown negotiable option", field: "rateNegotiable" };

  const accommodation = oneOf(str(body, "accommodation"), ACCOMMODATION);
  if (!accommodation) return { error: "Tell us what accommodation you need", field: "accommodation" };

  const rtw = oneOf(str(body, "rtw"), RTW);
  if (!rtw) return { error: "Tell us about your right to work", field: "rtw" };

  const visibility = oneOf(str(body, "visibility") || "public", VISIBILITY);
  if (!visibility) return { error: "Choose who can see your profile", field: "visibility" };

  const consents: ConsentInput = {
    privacy: body.consentPrivacy === true,
    employer_view: body.consentInvite === true,
    email_alerts: body.consentAlerts === true,
  };

  const requestedFrequency = oneOf(str(body, "alertFrequency"), ALERT_FREQUENCY) || "off";
  // Three independent gates must agree before an alert can ever be sent.
  const alertFrequency =
    consents.email_alerts && visibility === "public" && requestedFrequency !== "off" ? requestedFrequency : "off";

  return {
    consents,
    value: {
      full_name: fullName,
      preferred_name: str(body, "preferredName", 100) || null,
      email,
      phone,
      role,
      experience,
      live_in_experience: liveInExperience,
      specialisms,
      languages: str(body, "languages", 200) || null,
      regions,
      postcode_private: postcode.toUpperCase(),
      postcode_area: area,
      radius,
      blocks,
      start_date: startDate,
      time_off: timeOff,
      rate_basis: rateBasis,
      rate_pence: ratePence,
      rate_negotiable: rateNegotiable,
      rate_notes: str(body, "rateNotes", 1000) || null,
      accommodation,
      rtw,
      visibility,
      alert_frequency: alertFrequency,
    },
  };
}

async function recordConsents(
  supabase: SupabaseClient,
  carerId: string,
  consents: ConsentInput,
  source: "web_form" | "account_page",
  previous: { privacy: boolean; employer_view: boolean; email_alerts: boolean }
): Promise<boolean> {
  // Append only on an actual change, so a routine edit doesn't spam a fresh
  // privacy grant into the history every save.
  const rows = [
    { consent_type: "privacy", granted: consents.privacy },
    { consent_type: "employer_view", granted: consents.employer_view },
    { consent_type: "email_alerts", granted: consents.email_alerts },
  ]
    .filter((row) => row.granted !== previous[row.consent_type as keyof ConsentInput])
    .map((row) => ({
      carer_id: carerId,
      consent_type: row.consent_type,
      granted: row.granted,
      text_version: LIVE_IN_CONSENT_VERSION,
      granted_at: row.granted ? new Date().toISOString() : null,
      withdrawn_at: row.granted ? null : new Date().toISOString(),
      source,
    }));

  if (rows.length === 0) return true;
  const { error } = await supabase.from("live_in_consents").insert(rows);
  return !error;
}

async function latestConsents(supabase: SupabaseClient, carerId: string) {
  const { data } = await supabase
    .from("live_in_consents")
    .select("consent_type, granted, created_at")
    .eq("carer_id", carerId)
    .order("created_at", { ascending: false });

  // Rows arrive newest-first, so the first sighting of each type wins and a
  // later withdrawal overrides an earlier grant.
  const latest: Record<string, boolean> = {};
  for (const row of data || []) {
    if (row.consent_type in latest) continue;
    latest[row.consent_type] = !!row.granted;
  }
  return {
    privacy: latest.privacy ?? false,
    employer_view: latest.employer_view ?? false,
    email_alerts: latest.email_alerts ?? false,
  };
}

liveIn.get("/me", requireAuth, async (c) => {
  const supabase = c.get("supabase");
  const { data: profile, error } = await supabase
    .from("live_in_carers")
    .select("*")
    .eq("user_id", c.get("userId"))
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return c.json({ error: error.message }, 400);

  if (!profile) {
    return c.json({
      has_profile: false,
      account_email: c.get("user").email || null,
      account_name: (c.get("user").user_metadata?.full_name as string | undefined) || null,
    });
  }

  const [dbs, consents, invites] = await Promise.all([
    supabase.from("live_in_dbs").select("dbs_state, dbs_check_date").eq("carer_id", profile.id).maybeSingle(),
    latestConsents(supabase, profile.id),
    // View, not an embed: `jobs` has no candidate read policy.
    supabase
      .from("live_in_carer_invites")
      .select("id, job_id, status, message, created_at, responded_at, title, location, pay_range, job_status")
      .eq("carer_id", profile.id)
      .order("created_at", { ascending: false }),
  ]);

  return c.json({
    has_profile: true,
    profile,
    dbs: dbs.data || { dbs_state: "not_yet_verified", dbs_check_date: null },
    consents,
    invites: invites.data || [],
  });
});

liveIn.post("/me", requireAuth, async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const { data: existing } = await supabase.from("live_in_carers").select("id").eq("user_id", userId).maybeSingle();
  if (existing) return c.json({ error: "You already have a live-in carer profile", profile_id: existing.id }, 409);

  const body = await c.req.json().catch(() => ({}));
  const { value, consents, error, field } = validate(body, c.get("user"));
  if (error || !value || !consents) return c.json({ error: error || "Invalid profile", field }, 400);

  // Rejected on the server even if the client sends it — the profile may not
  // exist without the privacy consent.
  if (!consents.privacy) {
    return c.json({ error: "Tick the privacy notice box to create your profile", field: "consentPrivacy" }, 400);
  }

  const { data: created, error: insertError } = await supabase
    .from("live_in_carers")
    .insert({ user_id: userId, ...value })
    .select("id")
    .single();

  if (insertError) return c.json({ error: insertError.message }, 400);

  const consentsOk = await recordConsents(supabase, created.id, consents, "web_form", {
    privacy: false,
    employer_view: false,
    email_alerts: false,
  });

  if (!consentsOk) {
    // Narrow RPC rather than a DELETE grant (which would let a client hard
    // delete past the soft-delete rule). Only removes a consent-less own row.
    await supabase.rpc("discard_live_in_profile", { p_carer_id: created.id });
    return c.json({ error: "Could not record your consent — please try again" }, 500);
  }

  const dbsNumber = str(body, "dbsNumber", 40);
  if (dbsNumber) {
    const { error: dbsError } = await supabase.rpc("submit_live_in_dbs_number", { p_certificate_number: dbsNumber });
    if (dbsError) return c.json({ error: dbsError.message }, 400);
  }

  return c.json({ profile_id: created.id }, 201);
});

liveIn.patch("/me", requireAuth, async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const { data: existing, error: existingError } = await supabase
    .from("live_in_carers")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) return c.json({ error: existingError.message }, 400);
  if (!existing) return c.json({ error: "No live-in carer profile for this account" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const previous = await latestConsents(supabase, existing.id);

  // Accept a partial edit: merge onto the current row, then run exactly the
  // same validation as registration. Consent flags are merged too, otherwise
  // a partial edit would silently withdraw a grant the carer still holds.
  const merged: Record<string, unknown> = {
    fullName: existing.full_name,
    preferredName: existing.preferred_name || "",
    phone: existing.phone,
    role: existing.role,
    experience: existing.experience,
    liveInExperience: existing.live_in_experience,
    specialisms: existing.specialisms,
    languages: existing.languages || "",
    regions: existing.regions,
    postcode: existing.postcode_private,
    radius: existing.radius,
    blocks: existing.blocks,
    startDate: existing.start_date,
    timeOff: existing.time_off || "",
    rateBasis: existing.rate_basis,
    rateAmount: existing.rate_pence / 100,
    rateNegotiable: existing.rate_negotiable || "",
    rateNotes: existing.rate_notes || "",
    accommodation: existing.accommodation,
    rtw: existing.rtw,
    visibility: existing.visibility,
    alertFrequency: existing.alert_frequency,
    consentPrivacy: true,
    consentInvite: previous.employer_view,
    consentAlerts: previous.email_alerts,
    ...body,
  };

  const { value, consents, error, field } = validate(merged, c.get("user"));
  if (error || !value || !consents) return c.json({ error: error || "Invalid profile", field }, 400);

  // Privacy consent already exists for this profile; an edit never removes it.
  if (!consents.privacy) {
    return c.json({ error: "The privacy consent cannot be withdrawn here — delete your profile instead", field: "consentPrivacy" }, 400);
  }

  const { error: updateError } = await supabase
    .from("live_in_carers")
    .update({ ...value, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("user_id", userId);

  if (updateError) return c.json({ error: updateError.message }, 400);

  const consentsOk = await recordConsents(supabase, existing.id, consents, "account_page", previous);
  if (!consentsOk) return c.json({ error: "Profile saved, but the consent change could not be recorded" }, 500);

  const dbsNumber = typeof body.dbsNumber === "string" ? body.dbsNumber.trim() : "";
  if (dbsNumber) {
    const { error: dbsError } = await supabase.rpc("submit_live_in_dbs_number", { p_certificate_number: dbsNumber });
    if (dbsError) return c.json({ error: dbsError.message }, 400);
  }

  return c.json({ status: "ok" });
});

liveIn.delete("/me", requireAuth, async (c) => {
  const { error } = await c.get("supabase").rpc("delete_my_live_in_profile");
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ status: "ok" });
});

liveIn.post("/invites/:id/respond", requireAuth, async (c) => {
  const supabase = c.get("supabase");
  const body = await c.req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "accept" && action !== "decline") {
    return c.json({ error: "action must be accept or decline" }, 400);
  }

  const { data, error } = await supabase
    .from("live_in_invites")
    .update({
      status: action === "accept" ? "accepted" : "declined",
      responded_at: new Date().toISOString(),
    })
    .eq("id", c.req.param("id"))
    .eq("status", "sent")
    .select("id, status")
    .maybeSingle();

  if (error) return c.json({ error: error.message }, 400);
  if (!data) return c.json({ error: "That invite has already been answered, or isn't yours" }, 404);
  return c.json({ invite: data });
});

export default liveIn;

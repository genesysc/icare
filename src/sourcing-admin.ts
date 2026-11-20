import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";
import { createClient as createFc, findWebsite, findCareersUrl, extractVacancies, scrapeText } from "./sourcing/firecrawl";
import { createBatch, runBatch, type Store, type Deps } from "./sourcing/pipeline";
import { extractContacts, saveContacts } from "./sourcing/contacts";
import { jobKey } from "./sourcing/rules";
import { runUpkeep, type UpkeepStore } from "./sourcing/upkeep";

// Admin-only sponsor sourcing tool (migration 0065). No service key: every
// call runs as the signed-in admin and is gated by RLS + is_app_admin().
// This feature NEVER sends email.

type Bindings = { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; FIRECRAWL_API_KEY?: string };
type Variables = { supabase: SupabaseClient; userId: string; user: User };

/** 403 unless the signed-in user is in app_admins. Fails closed. */
export const adminOnly = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const { data, error } = await c.get("supabase").rpc("is_app_admin");
  if (error || data !== true) return c.json({ error: "forbidden" }, 403);
  await next();
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const DEFAULT_COST_CAP = 100; // Firecrawl calls per batch (~4 per company)

export function supabaseStore(db: SupabaseClient, batchId: string | null): Store & { expiryDays(): Promise<number> } {
  const num = async (key: string, dflt: number) => {
    const { data } = await db.from("sourcing_settings").select("value").eq("key", key).maybeSingle();
    return data ? Number(data.value) : dflt;
  };
  return {
    expiryDays: () => num("expiry_days", 30),
    async settings() {
      return {
        minHourlyPay: await num("min_hourly_pay", 12.83),
        defaultWeeklyHours: await num("default_weekly_hours", 37.5),
        dailyPublishCap: await num("daily_publish_cap", 50),
      };
    },
    async upsertCompany(name) {
      const { normaliseName } = await import("./sourcing/names");
      const key = normaliseName(name);
      const { data: ex } = await db.from("companies").select("id").eq("name_normalised", key).maybeSingle();
      if (ex) return ex.id as string;
      const { data, error } = await db.from("companies").insert({ name, name_normalised: key, batch_id: batchId }).select("id").single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    async getCompany(id) {
      const { data, error } = await db.from("companies").select("id,name,website,careers_url,status").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data as any;
    },
    async updateCompany(id, patch) { await db.from("companies").update(patch).eq("id", id); },
    async publishedToday() {
      const start = new Date(); start.setUTCHours(0, 0, 0, 0);
      const { count } = await db.from("sponsored_jobs").select("id", { count: "exact", head: true }).eq("sourced", true).gte("created_at", start.toISOString());
      return count ?? 0;
    },
    async registerMatched(name) {
      const { data } = await db.rpc("match_sponsor", { p_name: name });
      const row = (data as Array<{ status: string }> | null)?.[0];
      return !!row && row.status !== "none";
    },
    async existingKeys(companyId) {
      const { data } = await db.from("sponsored_jobs").select("title,town").eq("company_id", companyId).eq("sourced", true);
      return new Set((data ?? []).map((r: any) => jobKey(r.title, r.town ?? "")));
    },
    async publish(companyId, job, verdict) {
      const { data: co } = await db.from("companies").select("name").eq("id", companyId).single();
      const days = await num("expiry_days", 30);
      const payload = {
        source_job_id: `sourced:${companyId}:${slug(job.title)}-${slug(job.location)}`,
        title: job.title, employer_name: co?.name, town: job.location || null, location_name: job.location || null,
        salary_min: verdict.hourly ? Math.round(verdict.hourly * 100) / 100 : null,
        salary_max: verdict.hourly ? Math.round(verdict.hourly * 100) / 100 : null, salary_period: "hour",
        hours: job.hoursText, apply_url: job.applyUrl, description: job.description,
        posted_at: new Date().toISOString(), expires_at: new Date(Date.now() + days * 86400000).toISOString(),
      };
      const { data, error } = await db.rpc("publish_sourced_job", {
        p_company: companyId, p_job: payload,
        p_extra: { hourly_pay: verdict.hourly, sponsorship_state: verdict.sponsorshipState, sponsorship_note: verdict.note ?? null },
      });
      if (error) return { published: false, reason: "publish_failed" };
      const r = data as { published: boolean; reason?: string };
      return r;
    },
    async saveContacts(companyId, contacts) {
      const { data: co } = await db.from("companies").select("name").eq("id", companyId).single();
      await saveContacts({
        async suppressed() {
          const { data } = await db.from("contact_suppressions").select("email");
          return new Set((data ?? []).map((r: any) => String(r.email).toLowerCase()));
        },
        async insert(rows) { await db.from("company_contacts").upsert(rows, { onConflict: "company_id,email", ignoreDuplicates: true }); },
      }, companyId, co?.name ?? "", contacts);
    },
    async reject(companyId, job, reasons) {
      await db.from("job_rejections").insert({
        company_id: companyId, batch_id: batchId, title: job.title, location: job.location,
        apply_url: job.applyUrl, pay_text: job.payText, reasons, raw: job,
      });
    },
  };
}

export function supabaseUpkeepStore(db: SupabaseClient): UpkeepStore {
  return {
    async expiryDays() {
      const { data } = await db.from("sourcing_settings").select("value").eq("key", "expiry_days").maybeSingle();
      return data ? Number(data.value) : 30;
    },
    async companiesWithOpenJobs() {
      const { data } = await db.from("companies").select("id,careers_url").not("careers_url", "is", null);
      return (data ?? []) as { id: string; careers_url: string }[];
    },
    async openJobs(companyId) {
      const { data } = await db.from("sponsored_jobs").select("id,title,town,last_seen_at,created_at")
        .eq("company_id", companyId).eq("sourced", true).neq("status", "closed");
      return (data ?? []).map((r: any) => ({ id: r.id, title: r.title, location: r.town ?? "", last_seen_at: r.last_seen_at ?? r.created_at }));
    },
    async touch(ids) { await db.from("sponsored_jobs").update({ last_seen_at: new Date().toISOString() }).in("id", ids); },
    async close(ids) { await db.from("sponsored_jobs").update({ status: "closed" }).in("id", ids); },
  };
}

export const sourcingAdmin = new Hono<{ Bindings: Bindings; Variables: Variables }>();
sourcingAdmin.use("*", requireAuth);
sourcingAdmin.use("*", adminOnly);

sourcingAdmin.post("/batches", async (c) => {
  const body = await c.req.json<{ names?: string[]; costCap?: number }>().catch(() => ({} as any));
  const names = Array.isArray(body.names) ? body.names.map(String) : [];
  if (names.length === 0 || names.length > 200) return c.json({ error: "send 1-200 company names" }, 400);
  const db = c.get("supabase");
  const { data: b, error } = await db.from("sourcing_batches")
    .insert({ created_by: c.get("userId"), cost_cap: Math.min(Number(body.costCap) || DEFAULT_COST_CAP, 1000) }).select("id").single();
  if (error) return c.json({ error: error.message }, 500);
  const ids = await createBatch(supabaseStore(db, b.id), names);
  return c.json({ batchId: b.id, companyIds: ids });
});

sourcingAdmin.post("/process/:id{[0-9a-fA-F-]{36}}", async (c) => {
  const key = c.env.FIRECRAWL_API_KEY;
  if (!key) return c.json({ error: "FIRECRAWL_API_KEY is not set on the Worker" }, 503);
  const db = c.get("supabase");
  const id = c.req.param("id");
  const { data: co } = await db.from("companies").select("batch_id").eq("id", id).single();
  const { data: batch } = co?.batch_id
    ? await db.from("sourcing_batches").select("id,cost_cap,cost_used").eq("id", co.batch_id).single()
    : { data: null };
  const fc = createFc({ apiKey: key, costCap: Number(batch?.cost_cap ?? DEFAULT_COST_CAP) });
  fc.used = Number(batch?.cost_used ?? 0);
  const deps: Deps = {
    findWebsite: (n) => findWebsite(fc, n),
    findCareersUrl: (w) => findCareersUrl(fc, w),
    extractVacancies: (u) => extractVacancies(fc, u),
    findContacts: async (w) => {
      const url = `${w.replace(/\/$/, "")}/contact`;
      return extractContacts(await scrapeText(fc, url), url);
    },
  };
  const r = await runBatch(supabaseStore(db, batch?.id ?? null), deps, [id]);
  if (batch) await db.from("sourcing_batches").update({ cost_used: fc.used }).eq("id", batch.id);
  return c.json({ ...r, costUsed: fc.used });
});

sourcingAdmin.get("/overview", async (c) => {
  const db = c.get("supabase");
  const [companies, rejections, settings, contacts] = await Promise.all([
    db.from("companies").select("id,name,website,careers_url,status,status_detail,last_checked_at").order("created_at", { ascending: false }).limit(300),
    db.from("job_rejections").select("id,company_id,title,location,apply_url,pay_text,reasons,created_at").order("created_at", { ascending: false }).limit(300),
    db.from("sourcing_settings").select("key,value"),
    db.from("company_contacts").select("id,company_id,kind,email,name,role,sole_trader,source_url").order("created_at", { ascending: false }).limit(500),
  ]);
  return c.json({ companies: companies.data ?? [], rejections: rejections.data ?? [], settings: settings.data ?? [], contacts: contacts.data ?? [] });
});

const SETTING_KEYS = new Set(["min_hourly_pay", "expiry_days", "default_weekly_hours", "daily_publish_cap"]);
sourcingAdmin.put("/settings", async (c) => {
  const body = await c.req.json<Record<string, number>>().catch(() => ({} as Record<string, number>));
  const db = c.get("supabase");
  for (const [k, v] of Object.entries(body)) {
    if (!SETTING_KEYS.has(k) || !isFinite(Number(v)) || Number(v) < 0) return c.json({ error: `bad setting ${k}` }, 400);
    await db.from("sourcing_settings").upsert({ key: k, value: Number(v), updated_at: new Date().toISOString() });
  }
  return c.json({ ok: true });
});

sourcingAdmin.post("/upkeep", async (c) => {
  const key = c.env.FIRECRAWL_API_KEY;
  if (!key) return c.json({ error: "FIRECRAWL_API_KEY is not set on the Worker" }, 503);
  const fc = createFc({ apiKey: key, costCap: DEFAULT_COST_CAP });
  return c.json(await runUpkeep(supabaseUpkeepStore(c.get("supabase")), { extractVacancies: (u) => extractVacancies(fc, u) }, new Date()));
});

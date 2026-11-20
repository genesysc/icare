import { CostCapExceeded, RateLimited } from "./firecrawl";
import { normaliseName } from "./names";
import type { Contact } from "./contacts";
import { evaluateJob, jobKey, type Job, type Settings, type Verdict } from "./rules";

export type CompanyStatus = "queued" | "no_website" | "no_careers_page" | "no_vacancies" | "done" | "needs_a_look";
export interface CompanyRow { id: string; name: string; website?: string | null; careers_url?: string | null; status: CompanyStatus }

export interface Store {
  settings(): Promise<Settings & { dailyPublishCap: number }>;
  upsertCompany(name: string): Promise<string>;
  getCompany(id: string): Promise<CompanyRow>;
  updateCompany(id: string, patch: Record<string, unknown>): Promise<void>;
  publishedToday(): Promise<number>;
  registerMatched(companyName: string): Promise<boolean>;
  existingKeys(companyId: string): Promise<Set<string>>;
  publish(companyId: string, job: Job, verdict: Verdict): Promise<{ published: boolean; reason?: string }>;
  reject(companyId: string, job: Job, reasons: string[]): Promise<void>;
  saveContacts?(companyId: string, contacts: Contact[], website: string): Promise<void>;
}

export interface Deps {
  findWebsite(name: string): Promise<string | null>;
  findCareersUrl(website: string): Promise<string | null>;
  extractVacancies(url: string): Promise<Job[]>;
  /** Public business contacts for later outreach. Never sends anything. */
  findContacts?(website: string): Promise<Contact[]>;
}

/**
 * Where an advert has no link of its own, link to the employer's careers page
 * (their own posting). Relative links are resolved against that page.
 */
export function resolveApplyUrl(applyUrl: string, careersUrl: string): string {
  const u = (applyUrl || "").trim();
  if (!u) return careersUrl;
  try { return new URL(u, careersUrl).toString(); } catch { return careersUrl; }
}

/** One row per company, however it is spelled or how often it is pasted. */
export async function createBatch(store: Store, names: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = normaliseName(name);
    if (name.length < 2 || !key || seen.has(key)) continue;
    seen.add(key);
    ids.push(await store.upsertCompany(name));
  }
  return ids;
}

export async function processCompany(store: Store, deps: Deps, companyId: string): Promise<void> {
  const company = await store.getCompany(companyId);
  const settings = await store.settings();
  const mark = (status: CompanyStatus, detail?: string) =>
    store.updateCompany(companyId, { status, status_detail: detail ?? null, last_checked_at: new Date().toISOString() });

  const website = company.website || (await deps.findWebsite(company.name));
  if (!website) return mark("no_website");
  if (deps.findContacts && store.saveContacts) {
    try {
      const found = await deps.findContacts(website);
      if (found.length) await store.saveContacts(companyId, found, website);
    } catch (e) {
      if (e instanceof CostCapExceeded) throw e;
      // contacts are a bonus: never block job processing
    }
  }
  const careers = company.careers_url || (await deps.findCareersUrl(website));
  await store.updateCompany(companyId, { website, careers_url: careers });
  if (!careers) return mark("no_careers_page");
  const jobs = await deps.extractVacancies(careers);
  if (jobs.length === 0) return mark("no_vacancies");

  const registerMatched = await store.registerMatched(company.name);
  const keys = await store.existingKeys(companyId);
  let published = await store.publishedToday();
  let capped = false;

  for (const raw of jobs) {
    const job = { ...raw, applyUrl: resolveApplyUrl(raw.applyUrl, careers) };
    const verdict = evaluateJob(job, { registerMatched, existingKeys: keys, settings });
    if (!verdict.publish) { await store.reject(companyId, job, verdict.reasons); continue; }
    if (published >= settings.dailyPublishCap) {
      capped = true;
      await store.reject(companyId, job, ["daily_cap"]);
      continue;
    }
    const res = await store.publish(companyId, job, verdict);
    if (res.published) { published++; keys.add(jobKey(job.title, job.location)); }
    else { capped = capped || res.reason === "daily_cap"; await store.reject(companyId, job, [res.reason ?? "publish_failed"]); }
  }
  await mark(capped ? "needs_a_look" : "done", capped ? "daily publish cap reached" : undefined);
}

export async function runBatch(
  store: Store, deps: Deps, ids: string[],
): Promise<{ processed: number; stoppedForCost: boolean; rateLimited: number }> {
  let processed = 0, rateLimited = 0;
  for (const id of ids) {
    try {
      await processCompany(store, deps, id);
      processed++;
    } catch (e) {
      if (e instanceof CostCapExceeded) {
        await store.updateCompany(id, { status: "needs_a_look", status_detail: "batch cost cap reached" });
        return { processed, stoppedForCost: true, rateLimited };
      }
      if (e instanceof RateLimited) {
        rateLimited++;
        await store.updateCompany(id, { status: "queued", status_detail: "Firecrawl rate limit - run it again in a minute" });
        continue;
      }
      await store.updateCompany(id, { status: "needs_a_look", status_detail: `error: ${(e as Error).message}`.slice(0, 200) });
    }
  }
  return { processed, stoppedForCost: false, rateLimited };
}

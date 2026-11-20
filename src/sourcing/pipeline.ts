import { CostCapExceeded } from "./firecrawl";
import { normaliseName } from "./names";
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
}

export interface Deps {
  findWebsite(name: string): Promise<string | null>;
  findCareersUrl(website: string): Promise<string | null>;
  extractVacancies(url: string): Promise<Job[]>;
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
  const careers = company.careers_url || (await deps.findCareersUrl(website));
  await store.updateCompany(companyId, { website, careers_url: careers });
  if (!careers) return mark("no_careers_page");
  const jobs = await deps.extractVacancies(careers);
  if (jobs.length === 0) return mark("no_vacancies");

  const registerMatched = await store.registerMatched(company.name);
  const keys = await store.existingKeys(companyId);
  let published = await store.publishedToday();
  let capped = false;

  for (const job of jobs) {
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
): Promise<{ processed: number; stoppedForCost: boolean }> {
  let processed = 0;
  for (const id of ids) {
    try {
      await processCompany(store, deps, id);
      processed++;
    } catch (e) {
      if (e instanceof CostCapExceeded) {
        await store.updateCompany(id, { status: "needs_a_look", status_detail: "batch cost cap reached" });
        return { processed, stoppedForCost: true };
      }
      await store.updateCompany(id, { status: "needs_a_look", status_detail: `error: ${(e as Error).message}`.slice(0, 200) });
    }
  }
  return { processed, stoppedForCost: false };
}

import { jobKey, type Job } from "./rules";

export interface UpkeepStore {
  expiryDays(): Promise<number>;
  companiesWithOpenJobs(): Promise<{ id: string; careers_url: string }[]>;
  openJobs(companyId: string): Promise<{ id: string; title: string; location: string; last_seen_at: string }[]>;
  touch(ids: string[]): Promise<void>;
  close(ids: string[]): Promise<void>;
}

/**
 * Re-read each company's careers page. Jobs still listed are marked seen; jobs
 * not seen for expiryDays are closed. An empty or failed read closes nothing
 * (a blocked/changed site must not wipe the board).
 */
export async function runUpkeep(
  store: UpkeepStore,
  deps: { extractVacancies(url: string): Promise<Job[]> },
  now: Date,
): Promise<{ expired: number; rechecked: number }> {
  const days = await store.expiryDays();
  let expired = 0, rechecked = 0;
  for (const c of await store.companiesWithOpenJobs()) {
    let jobs: Job[];
    try { jobs = await deps.extractVacancies(c.careers_url); } catch { continue; }
    if (jobs.length === 0) continue;
    const present = new Set(jobs.map((j) => jobKey(j.title, j.location)));
    const seen: string[] = [], stale: string[] = [];
    for (const oj of await store.openJobs(c.id)) {
      if (present.has(jobKey(oj.title, oj.location))) seen.push(oj.id);
      else if (now.getTime() - new Date(oj.last_seen_at).getTime() > days * 86400000) stale.push(oj.id);
    }
    if (seen.length) await store.touch(seen);
    if (stale.length) await store.close(stale);
    rechecked += seen.length;
    expired += stale.length;
  }
  return { expired, rechecked };
}

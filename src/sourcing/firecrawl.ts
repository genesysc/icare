// Thin Firecrawl REST wrapper. Firecrawl only fetches/extracts; all decisions
// are made by the rules engine. fetch is injected so tests never hit the network.
// NOTE: the live endpoints/shapes are mock-tested only (no API key in dev).
import type { Job } from "./rules";

export class CostCapExceeded extends Error {
  constructor(public used: number, public cap: number) {
    super(`cost cap ${cap} would be exceeded (used ${used})`);
  }
}

/** Firecrawl is busy (HTTP 429) even after retrying. Not the company's fault. */
export class RateLimited extends Error {
  constructor() { super("firecrawl rate limit"); }
}

export interface Client {
  apiKey: string;
  fetchFn: typeof fetch;
  costCap: number;
  used: number;
  sleep: (ms: number) => Promise<void>;
}

export const CALL_COST = { search: 1, extract: 1 } as const;

export function createClient(o: { apiKey: string; fetchFn?: typeof fetch; costCap: number; sleep?: (ms: number) => Promise<void> }): Client {
  return {
    apiKey: o.apiKey, fetchFn: o.fetchFn ?? ((input, init) => fetch(input, init)), costCap: o.costCap, used: 0,
    sleep: o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
  };
}

const BACKOFF_MS = [2000, 5000, 10000];

async function call(c: Client, path: string, cost: number, body: unknown): Promise<any> {
  if (c.used + cost > c.costCap) throw new CostCapExceeded(c.used, c.costCap);
  for (let attempt = 0; ; attempt++) {
    const res = await c.fetchFn(`https://api.firecrawl.dev/v2${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      if (attempt >= BACKOFF_MS.length) throw new RateLimited();
      await c.sleep(BACKOFF_MS[attempt]);
      continue;
    }
    if (!res.ok) throw new Error(`firecrawl ${path} ${res.status}`);
    c.used += cost; // only calls that worked are counted
    return res.json();
  }
}

const NOT_A_COMPANY_SITE =
  /(^|\.)(carehome\.co\.uk|homecare\.co\.uk|autumna\.co\.uk|nhs\.uk|caredirectory\.org\.uk|carehomes\.net|lottie\.org|bing|google|duckduckgo|indeed|linkedin|facebook|twitter|x|instagram|glassdoor|reed|totaljobs|cv-library|monster|gov\.uk|companieshouse\.gov\.uk|youtube|wikipedia|trustpilot|cqc\.org\.uk|yell|endole|find-and-update\.company-information\.service\.gov\.uk)\./;

function hostOf(u: string): string | null {
  try { return new URL(u).hostname.toLowerCase(); } catch { return null; }
}

export async function findWebsite(c: Client, name: string): Promise<string | null> {
  const r = await call(c, "/search", CALL_COST.search, { query: `${name} UK official website`, limit: 8 });
  for (const hit of r?.data?.web ?? []) {
    const h = hostOf(hit.url);
    if (!h || NOT_A_COMPANY_SITE.test(h + ".")) continue;
    return `https://${h}`;
  }
  return null;
}

export async function findCareersUrl(c: Client, website: string): Promise<string | null> {
  const host = hostOf(website);
  if (!host) return null;
  const r = await call(c, "/search", CALL_COST.search, { query: `site:${host} careers jobs vacancies`, limit: 8 });
  const hits: string[] = (r?.data?.web ?? []).map((h: any) => h.url).filter((u: string) => hostOf(u) === host);
  return hits.find((u) => /career|job|vacanc|work-?with-?us|join/i.test(u)) ?? null;
}

const SCHEMA = {
  type: "object",
  properties: {
    jobs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" }, location: { type: "string" }, pay: { type: "string" },
          hours: { type: "string" }, apply_url: { type: "string" }, description: { type: "string" },
        },
      },
    },
  },
};

export async function extractVacancies(c: Client, url: string): Promise<Job[]> {
  const r = await call(c, "/scrape", CALL_COST.extract, {
    url,
    formats: [{ type: "json", schema: SCHEMA, prompt: "List every current job vacancy on this page. Use only what the page says; leave a field empty if absent." }],
  });
  const out: Job[] = [];
  for (const j of r?.data?.json?.jobs ?? []) {
    const title = String(j.title ?? "").trim();
    if (!title) continue;
    out.push({
      title,
      location: String(j.location ?? "").trim(),
      payText: j.pay ? String(j.pay) : null,
      hoursText: j.hours ? String(j.hours) : null,
      applyUrl: String(j.apply_url ?? "").trim(),
      description: String(j.description ?? ""),
    });
  }
  return out;
}

/** Plain text of one page (used to look for public contact details). */
export async function scrapeText(c: Client, url: string): Promise<string> {
  const r = await call(c, "/scrape", CALL_COST.extract, { url, formats: ["markdown"] });
  return String(r?.data?.markdown ?? "");
}

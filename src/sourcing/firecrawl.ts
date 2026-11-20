// Thin Firecrawl REST wrapper. Firecrawl only fetches/extracts; all decisions
// are made by the rules engine. fetch is injected so tests never hit the network.
// NOTE: the live endpoints/shapes are mock-tested only (no API key in dev).
import type { Job } from "./rules";

export class CostCapExceeded extends Error {
  constructor(public used: number, public cap: number) {
    super(`cost cap ${cap} would be exceeded (used ${used})`);
  }
}

export interface Client {
  apiKey: string;
  fetchFn: typeof fetch;
  costCap: number;
  used: number;
}

export const CALL_COST = { search: 1, extract: 1 } as const;

export function createClient(o: { apiKey: string; fetchFn?: typeof fetch; costCap: number }): Client {
  return { apiKey: o.apiKey, fetchFn: o.fetchFn ?? fetch, costCap: o.costCap, used: 0 };
}

async function call(c: Client, path: string, cost: number, body: unknown): Promise<any> {
  if (c.used + cost > c.costCap) throw new CostCapExceeded(c.used, c.costCap);
  c.used += cost;
  const res = await c.fetchFn(`https://api.firecrawl.dev/v2${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`firecrawl ${path} ${res.status}`);
  return res.json();
}

const NOT_A_COMPANY_SITE =
  /(^|\.)(indeed|linkedin|facebook|twitter|x|instagram|glassdoor|reed|totaljobs|cv-library|monster|gov\.uk|companieshouse\.gov\.uk|youtube|wikipedia|trustpilot|cqc\.org\.uk|yell|endole|find-and-update\.company-information\.service\.gov\.uk)\./;

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

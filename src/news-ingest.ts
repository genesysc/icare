import { createClient } from "@supabase/supabase-js";

// News feed cron ingestion — migration 0048/0049. Runs on
// wrangler.jsonc's triggers.crons, no HTTP request/response involved at
// all. See HANDOVER.md's news-feed section for the full design writeup.
//
// Deliberately NOT the Node `rss-parser` package this session's other
// automation (scripts/daily-news-draft.js) uses — that one runs in
// GitHub Actions' real Node.js; this runs inside the actual Workers V8
// isolate, which has no Node built-ins. A small regex-based parser here
// instead — verified against this exact set of feeds by hand (curl)
// before being trusted: WHO's RSS, gov.uk's Atom, NHS England's RSS,
// and Google News' RSS search results all match the shapes below.
//
// No service_role key (see migration 0048's header comment) — this
// authenticates to the ingest_news_item()/prune_stale_news_items()/
// news_item_known_external_ids() RPCs with a shared secret
// (NEWS_INGEST_SECRET, a Worker secret — set via the Cloudflare
// dashboard, same as UNSPLASH_ACCESS_KEY) instead.

type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  UNSPLASH_ACCESS_KEY?: string;
  NEWS_INGEST_SECRET?: string;
  NEWSDATA_API_KEY?: string;
};

const FEEDS: { url: string; label: string }[] = [
  { url: "https://www.who.int/rss-feeds/news-english.xml", label: "WHO" },
  {
    url: "https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-of-health-and-social-care",
    label: "GOV.UK (DHSC)",
  },
  { url: "https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=nhs-england", label: "GOV.UK (NHS England)" },
  { url: "https://www.england.nhs.uk/feed/", label: "NHS England" },
];

// newsdata.io (founder-provided key, 2026-09-18) — replaced an earlier
// Google News RSS-search source entirely: same broad real-world-news
// need, but structured JSON from real outlets (verified by hand: The
// Guardian, Metro, Big Issue, etc.) with a genuine per-article image on
// most results, versus Google News RSS's redirect-wrapped links (whose
// og:image essentially never resolves in practice — verified 0/100 in
// an earlier test run, see PROGRESS.md) and its own undocumented/
// scraped-feed status. Two other free-tier options the founder also
// offered were evaluated and rejected: NewsAPI.org's free "Developer"
// plan explicitly forbids production use in its own terms (checked
// directly); webz.io's "health" category is dominated by press
// releases and paid placements (one result was literally a sponsored
// supplement ad) even with query filtering attempted.
//
// Kept to 2 queries, one page (10 results) each — newsdata.io's response
// headers show a real, if unconfirmed-exact, rate limit
// (X-RateLimit-Limit: 60 seen directly), and this repo has nowhere else
// making calls against the same key, so conservative usage here is the
// only guard against ever hitting it.
const NEWSDATA_QUERIES = ['"social care" OR "care worker" OR "aged care" OR "care home"', '"NHS workforce" OR "health workforce" OR "nursing shortage" OR "care worker visa"'];

type NewsDataArticle = {
  link?: string;
  title?: string;
  description?: string;
  pubDate?: string;
  image_url?: string | null;
  source_name?: string;
  article_id?: string;
};

async function fetchNewsDataItems(query: string, apiKey: string): Promise<RawItem[]> {
  try {
    const url = `https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&language=en`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[news-ingest] newsdata.io query "${query}" returned ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { status?: string; results?: NewsDataArticle[] };
    if (data.status !== "success") return [];
    return (data.results || [])
      .filter((a): a is NewsDataArticle & { link: string; title: string } => Boolean(a.link && a.title))
      .map((a) => ({
        title: a.title,
        url: a.link,
        description: (a.description || "").slice(0, 600),
        pubDateRaw: a.pubDate ? `${a.pubDate.replace(" ", "T")}Z` : null,
        sourceName: a.source_name || "newsdata.io",
        guid: a.article_id || null,
        imageUrl: a.image_url || null,
      }));
  } catch (err) {
    console.warn(`[news-ingest] newsdata.io query "${query}" failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

type RawItem = {
  title: string;
  url: string;
  description: string;
  pubDateRaw: string | null;
  sourceName: string;
  guid: string | null;
  imageUrl?: string | null;
};

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

function extractLinkHref(block: string): string | null {
  // Atom: <link rel="alternate" ... href="...">. RSS: <link>text</link>.
  const atomAlt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (atomAlt) return atomAlt[1];
  const atomAny = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (atomAny) return atomAny[1];
  const rss = extractTag(block, "link");
  return rss ? decodeEntities(rss.trim()) : null;
}

function extractSourceName(block: string, fallback: string): string {
  const m = block.match(/<source[^>]*>([^<]*)<\/source>/i);
  return m && m[1].trim() ? decodeEntities(m[1].trim()) : fallback;
}

// Parses either RSS <item> or Atom <entry> blocks — the feeds this
// pulls from are one or the other, never mixed within a single response.
function parseFeedItems(xml: string, sourceLabel: string): RawItem[] {
  const isAtom = /<entry[\s>]/.test(xml);
  const blocks = xml.match(isAtom ? /<entry>[\s\S]*?<\/entry>/g : /<item>[\s\S]*?<\/item>/g) || [];

  return blocks
    .map((block): RawItem | null => {
      const titleRaw = extractTag(block, "title");
      const url = extractLinkHref(block);
      if (!titleRaw || !url) return null;
      const descRaw = extractTag(block, isAtom ? "summary" : "description") || extractTag(block, "content") || "";
      const pubDateRaw = extractTag(block, isAtom ? "updated" : "pubDate");
      const guid = extractTag(block, isAtom ? "id" : "guid");
      return {
        title: stripTags(titleRaw),
        url,
        description: stripTags(descRaw).slice(0, 600),
        pubDateRaw,
        sourceName: extractSourceName(block, sourceLabel),
        guid: guid ? decodeEntities(guid.trim()) : null,
      };
    })
    .filter((i): i is RawItem => i !== null);
}

async function fetchFeed(url: string, label: string): Promise<RawItem[]> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iCareNewsBot/1.0; +https://icareltd.com)" } });
    if (!res.ok) {
      console.warn(`[news-ingest] feed "${label}" returned ${res.status}`);
      return [];
    }
    const xml = await res.text();
    return parseFeedItems(xml, label);
  } catch (err) {
    console.warn(`[news-ingest] feed "${label}" failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "adult-social-care": ["social care", "care worker", "care home", "domiciliary", "elderly care", "aged care", "care sector", "carer"],
  "nhs-policy": ["nhs", "department of health", "dhsc", "government", "minister", "parliament", "workforce plan", "cqc", "policy"],
  "global-health": ["who", "world health organization", "global health", "pandemic", "worldwide", "international health"],
  innovation: ["artificial intelligence", " ai ", "technology", "digital health", "innovation", "pilot scheme", "breakthrough", "app"],
};

function categorize(title: string, description: string): string {
  const haystack = ` ${title.toLowerCase()} ${description.toLowerCase()} `;
  let best: { category: string; score: number } = { category: "general", score: 0 };
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) if (haystack.includes(kw)) score++;
    if (score > best.score) best = { category, score };
  }
  return best.category;
}

async function hashId(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parsePubDate(raw: string | null): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// Bounded-read fetch: reads at most ~120KB (og:image/twitter:image meta
// tags always sit in <head>, near the top) with a short timeout — a
// cron job iterating over dozens of arbitrary external URLs shouldn't
// risk downloading a multi-MB page or hanging on a slow server.
async function fetchOgImage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; iCareNewsBot/1.0; +https://icareltd.com)" },
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < 120_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    reader.cancel().catch(() => {});
    const total = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      total.set(chunk, offset);
      offset += chunk.length;
    }
    const html = new TextDecoder().decode(total);
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    return m ? m[1] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const CATEGORY_IMAGE_QUERY: Record<string, string> = {
  "adult-social-care": "care worker elderly",
  "nhs-policy": "nurse hospital",
  "global-health": "healthcare clinic",
  innovation: "medical technology",
  general: "healthcare",
};

async function fetchUnsplashFallback(category: string, accessKey?: string): Promise<string | null> {
  if (!accessKey) return null;
  const query = CATEGORY_IMAGE_QUERY[category] || "healthcare";
  try {
    const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { urls?: { small?: string }; links?: { download_location?: string } }[] };
    const results = data.results || [];
    if (results.length === 0) return null;
    const photo = results[Math.floor(Math.random() * Math.min(results.length, 5))];
    if (photo.links?.download_location) {
      fetch(photo.links.download_location, { headers: { Authorization: `Client-ID ${accessKey}` } }).catch(() => {});
    }
    return photo.urls?.small || null;
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function scheduledNewsRefresh(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  const secret = env.NEWS_INGEST_SECRET;
  if (!secret) {
    console.error("[news-ingest] NEWS_INGEST_SECRET is not set — skipping this run. See HANDOVER.md for the manual setup step.");
    return;
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);

  const feedResults = await Promise.all(FEEDS.map((s) => fetchFeed(s.url, s.label)));
  const newsDataResults = env.NEWSDATA_API_KEY
    ? await Promise.all(NEWSDATA_QUERIES.map((q) => fetchNewsDataItems(q, env.NEWSDATA_API_KEY as string)))
    : [];
  if (!env.NEWSDATA_API_KEY) console.warn("[news-ingest] NEWSDATA_API_KEY is not set — skipping that source this run.");
  const allItems = [...feedResults.flat(), ...newsDataResults.flat()];
  console.log(`[news-ingest] fetched ${allItems.length} raw items from ${FEEDS.length} feeds + ${NEWSDATA_QUERIES.length} newsdata.io queries`);

  // De-dupe by URL and attach a stable external_id (hash of guid||url).
  const seenUrls = new Set<string>();
  const candidates: { item: RawItem; externalId: string; category: string; publishedAt: string }[] = [];
  for (const item of allItems) {
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    const externalId = await hashId(item.guid || item.url);
    candidates.push({
      item,
      externalId,
      category: categorize(item.title, item.description),
      publishedAt: parsePubDate(item.pubDateRaw),
    });
  }

  if (candidates.length === 0) {
    console.log("[news-ingest] nothing to ingest this run");
    return;
  }

  const { data: knownIds, error: knownErr } = await supabase.rpc("news_item_known_external_ids", {
    p_secret: secret,
    p_external_ids: candidates.map((c) => c.externalId),
  });
  if (knownErr) {
    console.error("[news-ingest] news_item_known_external_ids failed:", knownErr.message);
    return;
  }
  const known = new Set<string>(knownIds || []);
  const newCandidates = candidates.filter((c) => !known.has(c.externalId));
  console.log(`[news-ingest] ${candidates.length} candidates, ${newCandidates.length} genuinely new`);

  // Image resolution only for new items — existing ones keep whatever
  // image they were first ingested with (ingest_news_item's own
  // coalesce() never overwrites it). Bounded concurrency: this is
  // fetching arbitrary external publisher pages, not our own infra.
  //
  // Hard cap on top of that: most recent MAX_IMAGE_RESOLUTIONS_PER_RUN
  // new items only. A new item beyond the cap still gets ingested this
  // run (visible in the feed immediately) with no image — that's a
  // genuinely fine resting state, not a broken one: the frontend's card
  // treatment for a missing image is the same soft gradient block the
  // reference mockup already uses by default, never attempted again
  // later (this file only ever resolves an image at an item's first
  // sighting), so there's no silent backfill debt building up either —
  // what a run doesn't image, it simply never will, by design.
  // newsdata.io items already carry a real image (checked directly, most
  // results have one) — no need to spend an og:image fetch or an
  // Unsplash fallback call on those; only the direct-feed items (WHO/
  // gov.uk/NHS England, none of which include an image field at all)
  // still need this.
  const imageByExternalId = new Map<string, string | null>();
  const needsImageResolution = newCandidates.filter((c) => !c.item.imageUrl);
  for (const c of newCandidates) {
    if (c.item.imageUrl) imageByExternalId.set(c.externalId, c.item.imageUrl);
  }

  const MAX_IMAGE_RESOLUTIONS_PER_RUN = 60;
  const toImage = [...needsImageResolution].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_IMAGE_RESOLUTIONS_PER_RUN);
  await mapWithConcurrency(toImage, 6, async (c) => {
    const og = await fetchOgImage(c.item.url);
    const image = og || (await fetchUnsplashFallback(c.category, env.UNSPLASH_ACCESS_KEY));
    imageByExternalId.set(c.externalId, image);
  });

  let ingested = 0;
  let failed = 0;
  for (const c of candidates) {
    const { error } = await supabase.rpc("ingest_news_item", {
      p_secret: secret,
      p_external_id: c.externalId,
      p_title: c.item.title,
      p_summary: c.item.description || null,
      p_url: c.item.url,
      p_image_url: imageByExternalId.get(c.externalId) || null,
      p_source_name: c.item.sourceName,
      p_category: c.category,
      p_published_at: c.publishedAt,
    });
    if (error) {
      failed++;
      console.warn(`[news-ingest] ingest failed for "${c.item.title.slice(0, 60)}": ${error.message}`);
    } else {
      ingested++;
    }
  }

  const { error: pruneErr } = await supabase.rpc("prune_stale_news_items", { p_secret: secret });
  if (pruneErr) console.warn("[news-ingest] prune failed:", pruneErr.message);

  console.log(`[news-ingest] done — ${ingested} ingested (${newCandidates.length} new with image resolution attempted), ${failed} failed`);
  ctx.waitUntil(Promise.resolve()); // no background work outstanding, kept for signature clarity
}

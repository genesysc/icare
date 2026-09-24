// Daily health & social care news digest — draft generator, 2026-09-18.
//
// Runs from .github/workflows/daily-news-draft.yml on a daily cron, NOT
// inside the Worker (no runtime dependency added there). Fetches free
// RSS/Atom feeds + Google News RSS search (no API key, no subscription —
// see HANDOVER.md's blog section for why: cost was an explicit constraint
// this session, same reason Plausible beat GA4's own cost, then GA4 won
// on a *different* axis entirely). Drafts one roundup post covering the
// day's smaller stories, plus a standalone post for any story that shows
// up across 2+ independent sources (a simple, cheap "this is actually
// major" signal — not a guess). Writes real content/posts/*.md files,
// exactly like a human-authored post, then the workflow opens a PR — it
// never pushes to main directly. A human always reviews the actual
// rendered Markdown in the PR diff before anything goes live.
//
// Deliberately does NOT reproduce source articles. Every fact/quote in
// the drafted body must come only from the headline + snippet handed to
// the model — the prompt says so explicitly. Sources are cited as real
// links (never invented — built directly from the feed items themselves,
// never asked of the model), same "citing authoritative sources" stance
// build-blog-content.js already documents for hand-written posts.
//
// Usage: node scripts/daily-news-draft.js
// Env required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (Workers AI
// permission), UNSPLASH_ACCESS_KEY.

const fs = require("fs");
const os = require("os");
const path = require("path");
const Parser = require("rss-parser");

const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "content", "posts");

// Must match build-blog-content.js's own VALID_CATEGORIES exactly — kept
// as a separate literal (not imported) since that file isn't a module.
const VALID_CATEGORIES = [
  "Social Care",
  "NHS & Clinical Careers",
  "Pharmacy & Pharma",
  "Independent Healthcare",
  "Immigration & Sponsorship",
  "Workforce Policy",
];

const CATEGORY_SLUGS = {
  "Social Care": "social-care",
  "NHS & Clinical Careers": "nhs-clinical-careers",
  "Pharmacy & Pharma": "pharmacy-pharma",
  "Independent Healthcare": "independent-healthcare",
  "Immigration & Sponsorship": "immigration-sponsorship",
  "Workforce Policy": "workforce-policy",
};

// A generic, safe Unsplash search term per category, used to pick a real
// (non-hotlinked-by-guess) stock photo — see pickHeroImage() below.
const CATEGORY_IMAGE_QUERY = {
  "Social Care": "care worker elderly",
  "NHS & Clinical Careers": "nurse hospital",
  "Pharmacy & Pharma": "pharmacist pharmacy",
  "Independent Healthcare": "healthcare clinic",
  "Immigration & Sponsorship": "airport travel documents",
  "Workforce Policy": "hospital exterior",
};

// Official/authoritative feeds — verified working by hand (curl) before
// being hardcoded here, 2026-09-18. Deliberately not UK-only: WHO is
// global, the rest of the geographic spread comes from the Google News
// queries below, which aggregate across publishers worldwide.
const FEEDS = [
  { url: "https://www.who.int/rss-feeds/news-english.xml", label: "WHO" },
  {
    url: "https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-of-health-and-social-care",
    label: "GOV.UK (DHSC)",
  },
  { url: "https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=nhs-england", label: "GOV.UK (NHS England)" },
  { url: "https://www.england.nhs.uk/feed/", label: "NHS England" },
];

// Google News RSS search — no API key, free, and the only practical way
// to get genuinely global coverage without a paid news API (the other
// option this session explicitly ruled out on cost). `when:1d` scopes
// each query to the last day server-side, in addition to this script's
// own pubDate filter below (belt and braces — Google's own recency
// scoping has occasionally proven loose in ad hoc testing).
const GOOGLE_NEWS_QUERIES = [
  { q: '"social care" OR "care worker" OR "aged care" when:1d', label: "Google News: social/aged care" },
  { q: '"health workforce" OR "nursing shortage" OR "NHS workforce" when:1d', label: "Google News: health workforce" },
  { q: '"long-term care" OR "home care" staffing when:1d', label: "Google News: long-term/home care" },
  { q: "pharmacist OR \"pharmacy workforce\" when:1d", label: "Google News: pharmacy" },
  { q: '"health worker visa" OR "care worker visa" immigration when:1d', label: "Google News: immigration" },
];

function googleNewsUrl(q) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A crude but honest "is this the same story" signal: overlap of
// distinctive (4+ letter) words in the title, case-insensitive. Not
// trying to be clever here — false negatives (missing a real duplicate)
// just mean it stays in the roundup instead of getting its own post,
// which is the safe direction to be wrong in.
function titleKeywords(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4)
  );
}

function sameStory(a, b) {
  const ka = titleKeywords(a.title);
  const kb = titleKeywords(b.title);
  if (ka.size === 0 || kb.size === 0) return false;
  let shared = 0;
  for (const w of ka) if (kb.has(w)) shared++;
  // Ratio alone false-positives on short, generic, syndicated-column
  // titles (found live: "Ask the Pharmacist - <local outlet>" repeats
  // near-verbatim across a dozen local news sites daily — only 2
  // distinctive words, so any two instances hit ratio 1.0 despite being
  // a recurring column, not a news story). Requiring a minimum absolute
  // overlap alongside a lower ratio filters that out while still
  // catching real multi-outlet coverage of the same story even when
  // outlets word their own headline quite differently (verified live: a
  // WHO workforce-gap story covered by 6 outlets only fully clustered at
  // 0.4, not 0.5 — exact-word matching has no stemming, so "nearing" vs
  // "near" vs "approaching" don't match each other at all; a genuinely
  // fuzzy/semantic match would do better, but this repo's simple
  // devDependency-only tooling convention makes that disproportionate
  // for a v1 that always goes through human review before it can ship
  // — see writePost()'s use in main() and the workflow's PR-not-push
  // design. An occasional near-duplicate "major" post is a review-time
  // catch, not a silent live-content bug.
  return shared >= 3 && shared / Math.min(ka.size, kb.size) >= 0.4;
}

async function fetchAllItems() {
  const parser = new Parser({ customFields: { item: ["source"] } });
  const cutoff = Date.now() - 26 * 60 * 60 * 1000; // 26h — a little slack past 24h for cron drift
  const items = [];

  const sources = [...FEEDS, ...GOOGLE_NEWS_QUERIES.map((g) => ({ url: googleNewsUrl(g.q), label: g.label }))];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url);
      for (const item of feed.items || []) {
        const pubDate = item.isoDate || item.pubDate;
        const ts = pubDate ? Date.parse(pubDate) : NaN;
        if (!Number.isNaN(ts) && ts < cutoff) continue;
        items.push({
          title: (item.title || "").trim(),
          url: item.link || "",
          publisher: item.source || item.creator || src.label,
          feedLabel: src.label,
          pubDate: pubDate || null,
          snippet: (item.contentSnippet || item.content || "").trim().slice(0, 500),
        });
      }
    } catch (err) {
      console.warn(`WARN: feed "${src.label}" (${src.url}) failed: ${err.message}`);
    }
  }

  // De-dupe exact URL repeats (the same Google News item can surface
  // across two of our overlapping queries).
  const seen = new Set();
  return items.filter((i) => {
    if (!i.url || !i.title || seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });
}

// Groups items into stories. A "story" backed by 2+ distinct publishers
// is a "major" candidate; everything else goes in the roundup pool.
function clusterStories(items) {
  const clusters = [];
  for (const item of items) {
    // Match against ANY item already in a cluster, not just the first —
    // titles of the same real story can drift enough in wording that
    // item C matches item B but not item A, even though A and B are
    // already grouped. Comparing only against the cluster's first item
    // (the original approach) missed exactly this, splitting one real
    // story into 2-3 separate "major" clusters in testing.
    const cluster = clusters.find((c) => c.items.some((existing) => sameStory(existing, item)));
    if (cluster) cluster.items.push(item);
    else clusters.push({ items: [item] });
  }
  for (const c of clusters) {
    c.publishers = new Set(c.items.map((i) => i.publisher));
  }
  const major = clusters.filter((c) => c.publishers.size >= 2).sort((a, b) => b.publishers.size - a.publishers.size);
  const roundupItems = clusters.filter((c) => c.publishers.size < 2).map((c) => c.items[0]);
  return { major, roundupItems };
}

const DRAFT_SCHEMA = {
  type: "object",
  required: ["title", "seoTitle", "metaDescription", "category", "tags", "primaryKeyword", "secondaryKeywords", "heroImageAlt", "bodyMarkdown", "faq"],
  properties: {
    title: { type: "string", description: "The post's display title, similar in style to a real news/explainer headline." },
    seoTitle: { type: "string", description: "<= 60 characters. A concise SEO-friendly version of the title." },
    metaDescription: { type: "string", description: "120-155 characters. A single sentence summarizing the post for search results." },
    category: { type: "string", enum: VALID_CATEGORIES },
    tags: { type: "array", items: { type: "string" }, description: "3-6 short topical tags." },
    primaryKeyword: { type: "string" },
    secondaryKeywords: { type: "array", items: { type: "string" }, description: "2-4 related search phrases." },
    heroImageAlt: { type: "string", description: "A short, accurate alt-text description of a generic photo that would suit this post's topic (e.g. 'A nurse reviewing patient notes on a hospital ward')." },
    disclaimer: { type: ["string", "null"], description: "Only set this if the post touches legal, immigration, or regulatory advice that readers should double-check with a professional. Null otherwise." },
    bodyMarkdown: {
      type: "string",
      description:
        "The full article body as Markdown. Do not include a level-1 heading or repeat the title — start directly with a paragraph. Use '## ' for section headings. End with a '## The bottom line' section. Use ONLY facts present in the supplied headlines/snippets/sources — never invent statistics, quotes, or details. Cite sources inline as Markdown links using the exact URLs supplied, phrased naturally (e.g. 'According to [Publisher](url)...').",
    },
    faq: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        required: ["q", "a"],
        properties: { q: { type: "string" }, a: { type: "string" } },
      },
    },
  },
};

const DRAFT_RESPONSE_FORMAT = { type: "json_schema", json_schema: { name: "blog_draft", schema: DRAFT_SCHEMA } };

const MODEL = "@cf/zai-org/glm-4.7-flash"; // same model already vetted for structured output in src/candidates.ts

// No timeout here previously — a slow/hung Workers AI structured-output
// call (real, observed: 700-1000 word bodyMarkdown + faq array, all
// schema-constrained, pushes a "flash" model hard) could block the whole
// CI job indefinitely, well past GitHub's default 6h job timeout. 90s is
// generous for a single completion but still bounded.
const WORKERS_AI_TIMEOUT_MS = 90_000;

async function callWorkersAIOnce(messages) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKERS_AI_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages, response_format: DRAFT_RESPONSE_FORMAT, max_tokens: 4000 }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error(`Workers AI request timed out after ${WORKERS_AI_TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Workers AI request failed: ${res.status} ${res.statusText} — ${await res.text()}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Workers AI returned an error: ${JSON.stringify(data.errors)}`);
  const raw = data.result?.response;
  if (!raw) throw new Error("Workers AI returned no response field");
  // Same defensive handling as src/candidates.ts: with response_format
  // json_schema, `response` is normally already a parsed object, but
  // handle the string case too rather than assume.
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// A schema-constrained completion this size (title/metadata + a
// 700-1000 word bodyMarkdown + a faq array, all within max_tokens: 4000)
// genuinely comes back empty from this model often enough to have been
// observed live, not hypothesized — same known quirk src/candidates.ts's
// CV extraction already handles defensively. One retry before giving up,
// rather than failing the whole day's draft on a single transient miss.
async function callWorkersAI(messages) {
  try {
    return await callWorkersAIOnce(messages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[daily-news-draft] Workers AI call failed, retrying once: ${msg}`);
    return await callWorkersAIOnce(messages);
  }
}

function sourcesBlock(items) {
  return items.slice(0, 8).map((i) => `- "${i.title}" — ${i.publisher} — ${i.url}${i.snippet ? `\n  Snippet: ${i.snippet}` : ""}`).join("\n");
}

const SYSTEM_PROMPT = `You are writing for iCare Insights, a UK health and social care recruitment platform's news blog. Your voice is clear, factual, and useful to care workers, clinicians, and employers — never sensational, never medical advice, never speculation dressed as fact. You are given real headlines/snippets/links from news sources published in the last day. Write only from what is given to you. Every claim must be traceable to a supplied source. Cite sources as inline Markdown links using the exact URLs given — never invent a URL.`;

async function draftRoundup(items) {
  const dateLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const user = `Write a "Today in health & social care" roundup post for ${dateLabel}, covering the stories below from around the world. Group related items under short '## ' subheadings by theme (e.g. workforce, policy, pharmacy). For each story, write 2-4 original sentences of context, then cite the source as a Markdown link. Do not quote long passages verbatim from any source. Aim for roughly 600-900 words total. Pick the single VALID_CATEGORIES value that best fits the day's dominant theme.\n\nStories:\n${sourcesBlock(items)}`;
  return callWorkersAI([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ]);
}

async function draftMajorStory(cluster) {
  const user = `Multiple independent sources are reporting the same story today. Write a standalone deep-dive post (700-1000 words) explaining what happened, why it matters for care workers/clinicians/employers, and what readers should do about it — similar in depth to a real explainer article. Use ONLY the facts in the sources below; do not add outside knowledge or invented statistics. Cite each source as a Markdown link at the point its information is used.\n\nSources (all reporting the same underlying story):\n${sourcesBlock(cluster.items)}`;
  return callWorkersAI([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ]);
}

async function pickHeroImage(category) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) throw new Error("UNSPLASH_ACCESS_KEY is required");
  const query = CATEGORY_IMAGE_QUERY[category] || "healthcare";
  const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });
  if (!res.ok) throw new Error(`Unsplash search failed for "${query}": ${res.status} ${res.statusText}`);
  const data = await res.json();
  const results = data.results || [];
  if (results.length === 0) throw new Error(`Unsplash search returned no results for "${query}"`);
  // Pick randomly among the top results so the same category doesn't
  // always get the same photo two days running.
  const photo = results[Math.floor(Math.random() * Math.min(results.length, 5))];
  return photo.id; // the API's real id — resolved into a CDN id + real credit by build-blog-content.js, same pipeline every hand-written post since 2026-09-16 already uses.
}

function uniqueSlug(base) {
  let slug = base;
  let n = 2;
  const existing = new Set(fs.readdirSync(POSTS_DIR).map((f) => f.replace(/\.mdx?$/, "")));
  while (existing.has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

function relatedPostsFor(category) {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  const matches = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), "utf8");
    const m = raw.match(/^category:\s*"([^"]+)"/m);
    const slugM = raw.match(/^slug:\s*"([^"]+)"/m);
    if (m && slugM && m[1] === category) matches.push(slugM[1]);
  }
  return matches.slice(0, 3);
}

function yamlEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function writePost(draft, { sources, isRoundup }) {
  const today = new Date().toISOString().slice(0, 10);
  const baseSlug = slugify(draft.title);
  const slug = uniqueSlug(baseSlug);
  const wordCount = draft.bodyMarkdown.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.round(wordCount / 225));

  const frontmatter = [
    "---",
    `title: "${yamlEscape(draft.title)}"`,
    `seoTitle: "${yamlEscape(draft.seoTitle)}"`,
    `metaDescription: "${yamlEscape(draft.metaDescription)}"`,
    `slug: "${slug}"`,
    `category: "${draft.category}"`,
    `tags: [${draft.tags.map((t) => `"${yamlEscape(t)}"`).join(", ")}]`,
    `primaryKeyword: "${yamlEscape(draft.primaryKeyword)}"`,
    `secondaryKeywords: [${draft.secondaryKeywords.map((t) => `"${yamlEscape(t)}"`).join(", ")}]`,
    `author: "Charlie Xavier"`,
    `datePublished: "${today}"`,
    `dateModified: "${today}"`,
    `readingTime: ${readingTime}`,
    "heroImage:",
    `  unsplashPhotoId: "${draft.heroImageUnsplashId}"`,
    `  alt: "${yamlEscape(draft.heroImageAlt)}"`,
    `  focal: "center"`,
    `featured: false`,
    `relatedPosts: [${relatedPostsFor(draft.category).map((s) => `"${s}"`).join(", ")}]`,
    "sources:",
    ...sources.slice(0, 8).flatMap((s) => [`  - title: "${yamlEscape(s.title)}"`, `    publisher: "${yamlEscape(s.publisher)}"`, `    url: "${yamlEscape(s.url)}"`]),
    "faq:",
    ...draft.faq.flatMap((f) => [`  - q: "${yamlEscape(f.q)}"`, `    a: "${yamlEscape(f.a)}"`]),
    ...(draft.disclaimer ? [`disclaimer: "${yamlEscape(draft.disclaimer)}"`] : []),
    "---",
    "",
  ].join("\n");

  const filePath = path.join(POSTS_DIR, `${slug}.md`);
  fs.writeFileSync(filePath, frontmatter + draft.bodyMarkdown.trim() + "\n");
  return { slug, title: draft.title, filePath, isRoundup };
}

async function main() {
  console.log("Fetching feeds...");
  const items = await fetchAllItems();
  console.log(`Fetched ${items.length} items from the last 26h.`);
  if (items.length === 0) {
    console.log("No items found — nothing to draft today. Exiting cleanly.");
    return;
  }

  const { major, roundupItems } = clusterStories(items);
  console.log(`${major.length} candidate "major" stories (2+ independent sources), ${roundupItems.length} items for the roundup.`);

  const written = [];

  // Cap major standalone posts at 2/day — a safety valve against an
  // over-eager clustering match turning into a flood of thin posts.
  //
  // Each attempt is independently caught: a single story's Workers AI
  // call failing (timeout, transient empty response even after
  // callWorkersAI's own retry) shouldn't sink every other draft in the
  // same run — skip just that one and keep going.
  for (const cluster of major.slice(0, 2)) {
    try {
      const draft = await draftMajorStory(cluster);
      draft.heroImageUnsplashId = await pickHeroImage(draft.category);
      written.push(writePost(draft, { sources: cluster.items, isRoundup: false }));
    } catch (err) {
      console.warn(`[daily-news-draft] Skipping major story (${cluster.items[0]?.title?.slice(0, 60)}): ${err instanceof Error ? err.message : err}`);
    }
  }

  if (roundupItems.length > 0) {
    try {
      const draft = await draftRoundup(roundupItems);
      draft.title = draft.title || `Today in Health & Social Care — ${new Date().toISOString().slice(0, 10)}`;
      draft.heroImageUnsplashId = await pickHeroImage(draft.category);
      written.push(writePost(draft, { sources: roundupItems, isRoundup: true }));
    } catch (err) {
      console.warn(`[daily-news-draft] Skipping roundup: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (written.length === 0) {
    console.log("Nothing worth drafting today. Exiting cleanly.");
    return;
  }

  console.log(`\nWrote ${written.length} draft post(s):`);
  for (const w of written) console.log(`  - ${w.filePath}${w.isRoundup ? " (roundup)" : " (major story)"}`);

  const today = new Date().toISOString().slice(0, 10);
  const prTitle = `Daily health & social care draft — ${today} (${written.length} post${written.length > 1 ? "s" : ""})`;
  const prBody = [
    `Auto-generated draft(s) for review — nothing here is live until this PR is merged.`,
    ``,
    ...written.map((w) => `- **${w.isRoundup ? "Roundup" : "Standalone story"}**: "${w.title}" (\`content/posts/${w.slug}.md\`)`),
    ``,
    `Read each post's actual Markdown in the "Files changed" tab before merging — that's the real review step. Check facts against the cited sources, and edit directly in this PR's branch if anything needs a fix.`,
  ].join("\n");

  // Written to the OS temp dir (or DAILY_NEWS_SUMMARY_DIR if set),
  // deliberately never inside the repo, so there's no risk of these ever
  // being picked up by `git add` alongside the real content files. Title
  // and body are separate plain files so the workflow can feed them
  // straight to create-pull-request's `title`/`body-path` inputs without
  // any shell-escaping gymnastics.
  const summaryDir = process.env.DAILY_NEWS_SUMMARY_DIR || os.tmpdir();
  fs.writeFileSync(path.join(summaryDir, "daily-news-draft-summary.json"), JSON.stringify({ prTitle, prBody, written }, null, 2));
  fs.writeFileSync(path.join(summaryDir, "pr-title.txt"), prTitle);
  fs.writeFileSync(path.join(summaryDir, "pr-body.md"), prBody);
  console.log(`\nSummary written to ${summaryDir}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { fetchAllItems, clusterStories, sameStory, slugify, writePost, relatedPostsFor };

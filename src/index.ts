import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import auth from "./auth";
import candidates from "./candidates";
import employersApi from "./employers";
import employerChat from "./employer-chat";
import jobs from "./jobs";
import waitlist from "./waitlist";
import landingPage from "./landing.html";
import heroClinicianJpg from "./assets/hero-clinician.jpg";
import careHandsJpg from "./assets/care-hands.jpg";
import workforceCorridorJpg from "./assets/workforce-corridor.jpg";
import employerLandingPage from "./employers.html";
import privacyPage from "./privacy.html";
import termsPage from "./terms.html";
import signInPage from "./sign-in.html";
import employerSignInPage from "./employer-sign-in.html";
import verifyPage from "./verify.html";
import resetPasswordPage from "./reset-password.html";
import onboardingPage from "./onboarding.html";
import dashboardPage from "./dashboard.html";
import invitesPage from "./invites.html";
import pipelinesPage from "./pipelines.html";
import credentialsPage from "./credentials.html";
import visibilityPage from "./visibility.html";
import roundsPage from "./rounds.html";
import newsFeedPage from "./news-feed.html";
import networkPage from "./network.html";
import messagesPage from "./messages.html";
import memberPage from "./member.html";
import employerHomePage from "./employer-home.html";
import blog, { BLOG_POSTS, CATEGORY_LIST } from "./blog";
import news from "./news";
import sponsors from "./sponsors";
import sponsorCheckPage from "./sponsor-check.html";
import sponsoredJobs from "./sponsored-jobs";
import jobsBoardPage from "./jobs-board.html";
import liveInCarersPage from "./live-in-carers.html";
import liveInCarersSuccessPage from "./live-in-carers-success.html";
import liveInProfilePage from "./live-in-profile.html";
import liveInSearchPage from "./live-in-search.html";
import liveInCarersApi from "./live-in-carers";
import liveInSearchApi from "./live-in-search";
import { scheduledNewsRefresh } from "./news-ingest";
import { processSignupAlerts } from "./signup-alerts";
import community from "./community";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  MEDIA: R2Bucket;
  UNSPLASH_ACCESS_KEY?: string;
  NEWS_INGEST_SECRET?: string;
  NEWSDATA_API_KEY?: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
  SENDER_FROM_NAME?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.route("/auth", auth);
app.route("/candidates", candidates);
app.route("/waitlist", waitlist);
app.route("/blog", blog);
app.route("/news", news);
app.route("/community", community);
app.route("/sponsors", sponsors);
app.route("/sponsored-jobs", sponsoredJobs);

app.get("/", (c) => c.html(landingPage));

// /welcome only ever existed because `/` was still the pre-launch waitlist page
// and there was nowhere with real Log in / Sign up entry points (2026-09-10).
// The 2026-09-14 rebuild made `/` exactly that page, so the two would otherwise
// be near-identical and drift apart. Redirect rather than delete the route:
// the URL was live, and anything already pointing at it should still land
// somewhere sensible.
app.get("/welcome", (c) => c.redirect("/", 302));

// Landing-page photography, bundled into the Worker as Data modules rather
// than hotlinked from a stock-photo CDN (see src/assets/CREDITS.md for the
// licensing and the reasoning). Served from a fixed map, never a path read
// off the request, so there's no traversal surface. Immutable + a year of
// cache: the filenames are content-stable, and if a photo is ever swapped
// the filename changes with it.
const LANDING_ASSETS: Record<string, ArrayBuffer> = {
  "hero-clinician.jpg": heroClinicianJpg,
  "care-hands.jpg": careHandsJpg,
  "workforce-corridor.jpg": workforceCorridorJpg,
};

app.get("/assets/:name", (c) => {
  const asset = LANDING_ASSETS[c.req.param("name")];
  if (!asset) return c.json({ error: "Not found" }, 404);
  return new Response(asset, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
app.get("/employers", (c) => c.html(employerLandingPage));

// Live-in carer register (migration 0056). Page routes are registered before
// the /employers API mount for the same reason the landing page above is:
// employersApi's requireAuth on "*" would otherwise 401 a public page.
app.get("/live-in-carers", (c) => c.html(liveInCarersPage));
app.get("/live-in-carers/success", (c) => c.html(liveInCarersSuccessPage));
app.get("/live-in-profile", (c) => c.html(liveInProfilePage));
app.get("/employers/live-in-search", (c) => c.html(liveInSearchPage));
// UUID-constrained so it can't swallow the API's own `/carers` path.
app.get("/employers/live-in-search/:id{[0-9a-fA-F-]{36}}", (c) => c.html(liveInSearchPage));

// API. Mounted before employersApi so the live-in router's own requireAuth
// runs once, not behind the generic /employers/* middleware.
app.route("/live-in-carers", liveInCarersApi);
app.route("/employers/live-in-search", liveInSearchApi);

// Must be registered after the public GET /employers landing-page route
// above — employersApi mounts requireAuth on "*", and Hono runs matching
// middleware in registration order, so mounting it first would 401 the
// public page before the handler above ever runs (confirmed live on
// icareltd.com after this session's PR #29 merge: GET /employers was
// returning 401 instead of the marketing page).
app.route("/employers", employersApi);
app.route("/employers/chat", employerChat);
app.route("/employers/jobs", jobs);
app.get("/privacy", (c) => c.html(privacyPage));
app.get("/terms", (c) => c.html(termsPage));
app.get("/sign-in", (c) => c.html(signInPage));
app.get("/sign-up", (c) => c.html(signInPage));
app.get("/employer/sign-in", (c) => c.html(employerSignInPage));
app.get("/employer/sign-up", (c) => c.html(employerSignInPage));
app.get("/verify", (c) => c.html(verifyPage));
app.get("/reset-password", (c) => c.html(resetPasswordPage));
app.get("/onboarding", (c) => c.html(onboardingPage));
app.get("/dashboard", (c) => c.html(dashboardPage));
app.get("/invites", (c) => c.html(invitesPage));
app.get("/pipelines", (c) => c.html(pipelinesPage));
app.get("/credentials", (c) => c.html(credentialsPage));
app.get("/visibility", (c) => c.html(visibilityPage));
app.get("/rounds", (c) => c.html(roundsPage));
app.get("/news-feed", (c) => c.html(newsFeedPage));
app.get("/sponsor-check", (c) => c.html(sponsorCheckPage));
app.get("/jobs", (c) => c.html(jobsBoardPage));
// Renamed from Home to Rounds, 2026-09-12 — redirect anything still
// linking the old path (nothing left in this repo does, but an external
// bookmark or the browser's own history might).
app.get("/home", (c) => c.redirect("/rounds", 301));
app.get("/network", (c) => c.html(networkPage));
app.get("/member", (c) => c.html(memberPage));
app.get("/messages", (c) => c.html(messagesPage));
app.get("/employer/home", (c) => c.html(employerHomePage));

app.get("/health", (c) => c.json({ status: "ok" }));

// New-sign-up alerts to info@ (migration 0058, src/signup-alerts.ts).
// Called by the database (pg_net trigger + 15-minute pg_cron), not by
// browsers. The body's secret is checked by signup_alerts_claim() inside
// the database; a wrong one makes the claim fail -> 401. The sending runs
// in waitUntil so pg_net's 10s timeout never cuts it off.
app.post("/internal/signup-alert", async (c) => {
  const body = await c.req.json().catch(() => null);
  const secret = body && typeof body.secret === "string" ? body.secret : "";
  if (!secret) return c.json({ error: "missing secret" }, 401);
  const job = processSignupAlerts(c.env, secret).then(
    (r) => console.log(`[signup-alert] claimed ${r.claimed}, sent ${r.sent}`),
    (err) => console.error(`[signup-alert] ${err instanceof Error ? err.message : err}`)
  );
  c.executionCtx.waitUntil(job);
  return c.json({ ok: true }, 202);
});

app.get("/db-check", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.from("professions").select("id").limit(1);
  if (error) return c.json({ db: "error", message: error.message }, 500);
  return c.json({ db: "ok", sample: data });
});

// Public reference tables (RLS: readable by anyone), used to populate
// pickers for candidate_professions / candidate_skills.
app.get("/professions", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase
    .from("professions")
    .select("id, name, family, regulator")
    .order("sort_order", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ professions: data });
});

app.get("/skills", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.from("clinical_skills").select("id, label, family");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ skills: data });
});

// Used by the employer chat UI to render badge chips with a grade-distinct
// style (non-negotiable #2 — grade must stay visually distinct, including
// on the employer side, not just the candidate dashboard).
app.get("/badges", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.from("badges").select("code, label, grade, family, description");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ badges: data });
});

app.get("/qualification-types", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase
    .from("qualification_types")
    .select("id, label, family, renews_every_months")
    .order("family", { ascending: true })
    .order("label", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ qualification_types: data });
});

app.get("/prompts", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase
    .from("prompts")
    .select("id, label, placeholder, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ prompts: data });
});

app.get("/media-check", async (c) => {
  const list = await c.env.MEDIA.list({ limit: 1 });
  return c.json({ bucket: "icare", objects: list.objects.length });
});

// Covers the public marketing surface plus every blog route — not the
// signed-in app pages (those need auth to reach anyway, and are excluded
// from crawling by not appearing here or being linked from any indexable
// page). See HANDOVER.md's blog section for why the blog itself needed a
// sitemap/robots pair that didn't exist before.
app.get("/sitemap.xml", (c) => {
  const origin = new URL(c.req.url).origin;
  const staticUrls = ["/", "/employers", "/privacy", "/terms", "/blog"];
  const categoryUrls = CATEGORY_LIST.map((cat) => `/blog/category/${cat.slug}`);
  const postEntries = BLOG_POSTS.map((p) => ({ loc: `/blog/${p.slug}`, lastmod: p.dateModified }));
  const entries = [
    ...staticUrls.map((loc) => ({ loc, lastmod: undefined as string | undefined })),
    ...categoryUrls.map((loc) => ({ loc, lastmod: undefined as string | undefined })),
    ...postEntries,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url><loc>${origin}${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`
  )
  .join("\n")}
</urlset>`;
  return c.text(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
});

app.get("/robots.txt", (c) => {
  const origin = new URL(c.req.url).origin;
  // Allow all, including AI crawlers — visibility in AI answers is a goal
  // for the blog specifically (see HANDOVER.md's blog section).
  return c.text(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, 200, {
    "Content-Type": "text/plain; charset=utf-8",
  });
});

// llms.txt — an emerging (not yet universal) convention some AI crawlers
// check for a short, plain description of the site plus links to the
// content worth indexing. Directional, not load-bearing (2026-09-23
// blog handover, §7.6) — a handful of posts, not all of them, since the
// point is orientation, not a second sitemap. Picks the featured post
// (if any) plus the 4 most recently published, deduplicated.
app.get("/llms.txt", (c) => {
  const origin = new URL(c.req.url).origin;
  const sorted = [...BLOG_POSTS].sort((a, b) => (a.datePublished < b.datePublished ? 1 : -1));
  const featured = sorted.find((p) => p.featured);
  const picks = [featured, ...sorted].filter((p, i, arr) => p && arr.findIndex((q) => q?.slug === p.slug) === i).slice(0, 5);
  const lines = [
    "# iCare",
    "",
    "> The professional network for UK health and social care. Candidates prove their registrations, training and checks once, then carry that trust to every employer on iCare — candidates never pay, employers do.",
    "",
    `- [Insights (blog)](${origin}/blog): workforce news, careers and policy across UK health and social care, explained plainly.`,
    `- [Sitemap](${origin}/sitemap.xml)`,
    "",
    "## Recent Insights posts",
    "",
    ...picks.map((p) => `- [${p!.title}](${origin}/blog/${p!.slug}): ${p!.metaDescription}`),
  ];
  return c.text(lines.join("\n") + "\n", 200, { "Content-Type": "text/plain; charset=utf-8" });
});

// News feed ingestion — a Cloudflare Cron Trigger (wrangler.jsonc's
// triggers.crons), not a Hono route. Runs unattended, on its own
// schedule, with no request/response cycle at all — see
// src/news-ingest.ts for the fetch/parse/tag/ingest logic itself, kept
// out of this file to stay readable. This is the standard Module Worker
// shape for combining an HTTP handler with a scheduled one; Hono's own
// `app` is only ever the `fetch` half.
export default {
  fetch: app.fetch,
  scheduled: scheduledNewsRefresh,
};

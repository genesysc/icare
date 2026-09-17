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
import networkPage from "./network.html";
import messagesPage from "./messages.html";
import memberPage from "./member.html";
import employerHomePage from "./employer-home.html";
import blog, { BLOG_POSTS, CATEGORY_LIST } from "./blog";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  MEDIA: R2Bucket;
  UNSPLASH_ACCESS_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.route("/auth", auth);
app.route("/candidates", candidates);
app.route("/waitlist", waitlist);
app.route("/blog", blog);

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
// Renamed from Home to Rounds, 2026-09-12 — redirect anything still
// linking the old path (nothing left in this repo does, but an external
// bookmark or the browser's own history might).
app.get("/home", (c) => c.redirect("/rounds", 301));
app.get("/network", (c) => c.html(networkPage));
app.get("/member", (c) => c.html(memberPage));
app.get("/messages", (c) => c.html(messagesPage));
app.get("/employer/home", (c) => c.html(employerHomePage));

app.get("/health", (c) => c.json({ status: "ok" }));

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

export default app;

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import auth from "./auth";
import candidates from "./candidates";
import waitlist from "./waitlist";
import landingPage from "./landing.html";
import employerLandingPage from "./employers.html";
import privacyPage from "./privacy.html";
import termsPage from "./terms.html";
import signInPage from "./sign-in.html";
import employerSignInPage from "./employer-sign-in.html";
import verifyPage from "./verify.html";
import onboardingPage from "./onboarding.html";
import dashboardPage from "./dashboard.html";
import employerHomePage from "./employer-home.html";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  MEDIA: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.route("/auth", auth);
app.route("/candidates", candidates);
app.route("/waitlist", waitlist);

app.get("/", (c) => c.html(landingPage));
app.get("/employers", (c) => c.html(employerLandingPage));
app.get("/privacy", (c) => c.html(privacyPage));
app.get("/terms", (c) => c.html(termsPage));
app.get("/sign-in", (c) => c.html(signInPage));
app.get("/sign-up", (c) => c.html(signInPage));
app.get("/employer/sign-in", (c) => c.html(employerSignInPage));
app.get("/employer/sign-up", (c) => c.html(employerSignInPage));
app.get("/verify", (c) => c.html(verifyPage));
app.get("/onboarding", (c) => c.html(onboardingPage));
app.get("/dashboard", (c) => c.html(dashboardPage));
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

export default app;

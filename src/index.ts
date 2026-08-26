import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import auth from "./auth";
import candidates from "./candidates";
import waitlist from "./waitlist";
import landingPage from "./landing.html";
import employerLandingPage from "./employers.html";
import privacyPage from "./privacy.html";
import termsPage from "./terms.html";

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

app.get("/media-check", async (c) => {
  const list = await c.env.MEDIA.list({ limit: 1 });
  return c.json({ bucket: "icare", objects: list.objects.length });
});

export default app;

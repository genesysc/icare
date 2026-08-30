import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "./email";
import { waitlistWelcomeEmail, EARLY_SUPPORTER_THRESHOLD } from "./emails/waitlist-welcome";
import { employerWaitlistEmail } from "./emails/employer-waitlist";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
};

const waitlist = new Hono<{ Bindings: Bindings }>();

// Common consumer providers a UK candidate is likely to actually use.
// Deliberately short — this is for catching near-miss typos of well-known
// names, not a general "is this a real provider" check.
const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "icloud.com",
  "live.com",
  "aol.com",
  "btinternet.com",
  "sky.com",
  "virginmedia.com",
  "protonmail.com",
];

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// A domain that isn't itself a known provider but is 1-2 edits away from one
// (e.g. "gmai.com" vs "gmail.com") is very likely a typo, not a deliberately
// different address — even if the typo'd domain happens to be real and
// mail-accepting (typo-catching domains genuinely exist and have live MX
// records, which is exactly why domainAcceptsMail() alone can't catch this).
function likelyTypoOfKnownProvider(domain: string): string | null {
  if (COMMON_EMAIL_DOMAINS.includes(domain)) return null;
  for (const known of COMMON_EMAIL_DOMAINS) {
    if (Math.abs(domain.length - known.length) > 2) continue;
    if (levenshtein(domain, known) <= 2) return known;
  }
  return null;
}

// Format validation alone lets through anything shaped like word@word.word,
// which includes plausible-looking typos (e.g. "gmail.comgdd") that a
// regex can never distinguish from a real domain. The only real check is
// whether the domain can actually receive mail — done here via a live MX
// lookup through Cloudflare's own DNS-over-HTTPS resolver, no guessed API
// shape, just a standard DoH JSON query.
async function domainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { accept: "application/dns-json" },
    });
    if (!res.ok) return true; // resolver hiccup — don't block signups over it
    const data = await res.json<{ Answer?: unknown[]; Status?: number }>();
    if (Array.isArray(data.Answer) && data.Answer.length > 0) return true;
    // No MX records — some domains rely on an A/AAAA record as an implicit
    // mail target instead (rare, but valid per RFC 5321). Fall back to that
    // before rejecting outright.
    const aRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { accept: "application/dns-json" },
    });
    if (!aRes.ok) return true;
    const aData = await aRes.json<{ Answer?: unknown[] }>();
    return Array.isArray(aData.Answer) && aData.Answer.length > 0;
  } catch {
    return true; // network hiccup on our end — don't block signups over it
  }
}

waitlist.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;
  const role = body?.role === "employer" ? "employer" : "candidate";
  const orgName = typeof body?.org_name === "string" ? body.org_name.trim() : "";
  const hiringFor =
    role === "employer" && ["temp", "permanent", "both"].includes(body?.hiring_for) ? body.hiring_for : null;

  if (!email) return c.json({ error: "email is required" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "Please enter a valid email address" }, 400);
  }
  if (!fullName) return c.json({ error: "full_name is required" }, 400);
  if (role === "employer" && !orgName) return c.json({ error: "org_name is required" }, 400);

  const emailDomain = email.split("@")[1] ?? "";
  const suggestedDomain = likelyTypoOfKnownProvider(emailDomain.toLowerCase());
  if (suggestedDomain) {
    return c.json(
      { error: `That doesn't look right — did you mean @${suggestedDomain}? Please double-check your email address.` },
      400
    );
  }

  if (!(await domainAcceptsMail(email))) {
    return c.json({ error: "We couldn't find a mail server for that email's domain — please check for a typo" }, 400);
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { error } = await supabase.from("waitlist").insert({
    email,
    full_name: fullName,
    phone,
    role,
    org_name: role === "employer" ? orgName : null,
    hiring_for: hiringFor,
  });

  if (error) {
    // Unique violation — they're already on the list, treat as success.
    if (error.code === "23505") return c.json({ status: "ok", already_joined: true });
    return c.json({ error: error.message }, 400);
  }

  const { data: position } = await supabase.rpc("waitlist_count", { p_role: role });
  const isEarlySupporter = typeof position === "number" && position <= EARLY_SUPPORTER_THRESHOLD;
  const landingUrl = new URL(c.req.url).origin;

  const { subject, html } =
    role === "employer"
      ? employerWaitlistEmail({ fullName, orgName, isEarlySupporter, landingUrl })
      : waitlistWelcomeEmail({ fullName, isEarlySupporter, landingUrl });
  await sendTransactionalEmail(c.env, email, subject, html);

  return c.json({ status: "ok", position, is_early_supporter: isEarlySupporter }, 201);
});

waitlist.get("/count", async (c) => {
  const role = c.req.query("role") === "employer" ? "employer" : "candidate";
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("waitlist_count", { p_role: role });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ count: data });
});

export default waitlist;

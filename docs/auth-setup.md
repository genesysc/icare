# Auth — setup

Next.js App Router + Supabase Auth. If you're not on Next.js, everything in
`0002_auth.sql` still applies unchanged — only the TypeScript moves.

## Where the files go

| File | Path in this repo |
|---|---|
| Auth migration | `supabase/migrations/0002_auth.sql` |
| Browser client | `lib/supabase/client.ts` |
| Server client | `lib/supabase/server.ts` |
| Middleware helper | `lib/supabase/middleware.ts` |
| Root middleware | `middleware.ts` |
| Server actions | `app/(auth)/actions.ts` |
| Join page | `app/(auth)/join/page.tsx` |
| Join form | `app/(auth)/join/join-form.tsx` |
| Verify page | `app/(auth)/verify/page.tsx` |
| Verify form | `app/(auth)/verify/verify-form.tsx` |

```bash
npm install @supabase/supabase-js @supabase/ssr
```

```
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

The service role key is not in that list on purpose. It bypasses every policy
in the schema. It belongs in a server-only environment variable when you get to
admin tooling, and nowhere near a file prefixed `NEXT_PUBLIC_`.

## Supabase dashboard — five settings

**1. The email template. This is the one that catches everybody.**

Authentication → Emails → Magic Link. The default template contains
`{{ .ConfirmationURL }}`, which sends a link. You want a code. Replace the body
with something that uses `{{ .Token }}`:

```html
<h2>Your code</h2>
<p style="font-size:32px;letter-spacing:8px;font-weight:700">{{ .Token }}</p>
<p>Enter this on the care·register tab you already have open. It works for ten minutes.</p>
<p>If you didn't ask for this, ignore this email — nobody can get in without the code.</p>
```

If you skip this, `verifyOtp` will keep rejecting perfectly good codes and you
will lose an afternoon.

**2. OTP settings.** Authentication → Providers → Email: length 6, expiry 600
seconds. Turn *off* "Confirm email" — the code *is* the confirmation, and
leaving both on makes people confirm twice.

**3. Rate limits.** Authentication → Rate Limits. Drop the OTP send limit to
around 4 per hour per address. Supabase's default is generous, and an open
"send me a code" endpoint is an email-bombing tool pointed at strangers.

**4. Custom SMTP.** Authentication → Emails → SMTP. Supabase's built-in sender
is capped at a handful of emails an hour and is for development only. Use
Resend or Postmark before you let a single real candidate near this. Your auth
emails are transactional and must not go through the same domain reputation as
marketing — put them on a subdomain.

**5. Site URL and redirects.** Authentication → URL Configuration. Set the site
URL and add your preview domains, or codes will verify and then dump people on
localhost.

## Then

```bash
supabase db push
```

To give yourself an admin account, sign up normally, then in the SQL editor:

```sql
update accounts set role = 'admin' where email = 'you@example.com';
update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
 where email = 'you@example.com';
```

Both lines. The first controls policies, the second controls routing. Sign out
and back in — the JWT only picks up the change on a fresh token.

To verify your first employer (Right at Home Enfield, presumably):

```sql
update employers set is_verified = true where org_name ilike '%right at home%';
```

## How the pieces fit

```
  /join  ──── requestCode() ──── signInWithOtp ──── email with {{ .Token }}
    │                                  │
    │                          trigger: handle_new_user
    │                          ├─ clamp role (admin unreachable)
    │                          ├─ create accounts row
    │                          ├─ create candidates | employers row
    │                          └─ write role into app_metadata → JWT
    ▼
  /verify ─── verifyCode() ──── verifyOtp ──── session cookie
                                     │
                                     ▼
                    role = candidate → /candidate
                    role = employer  → /employer (locked until is_verified)
```

## Things worth knowing before you extend this

**`getUser()`, never `getSession()`.** `getSession()` reads the cookie and
believes it. `getUser()` revalidates against Supabase. Anything that decides
what a person may see uses `getViewer()` from `lib/supabase/server.ts`, which
uses `getUser()`. The distinction is the difference between a login and a
suggestion.

**Middleware routes, RLS protects.** The middleware redirects people who are in
the wrong place. It is not the security boundary — someone calling your API
directly never touches it. Every table has policies for that reason. If you add
a table, add its policies in the same commit or you have quietly published it.

**Role can't be changed after signup, by design.** A trigger raises an
exception on any attempt. If a real person needs moving between account types,
close the account and create a new one. That's the honest answer for a platform
that has to show an auditor who saw which candidate's DBS status and when.

**Employer verification is currently a manual SQL update.** That's correct for
now — you want to speak to the first fifty employers anyway. Before it stops
being manual, decide what "verified" actually means: CQC provider ID matched
against the CQC register is the strongest signal, Companies House number is
weaker, a matching email domain is nearly worthless.

## Not built yet, and deliberately

- **SMS codes.** Needs Twilio and costs money per send. Email first; add phone
  when drop-off data says you need it.
- **Google sign-in.** Faster, but it leaks which staff use personal Gmail
  accounts, and it adds an OAuth callback route to secure. Worth doing once the
  email path is proven.
- **Two-factor for employers.** An employer account can see DBS status and
  contact details for real people. Once you have employers holding meaningful
  shortlists, TOTP on that side stops being optional. Supabase supports it
  natively — it's an evening's work, just not today's.
- **An 18+ check.** Most regulated activity requires it, but the honest answer
  depends on which roles you allow. A checkbox is defensible; collecting date of
  birth at sign-up is friction and age-discrimination exposure you don't need
  before you've got a hundred users.

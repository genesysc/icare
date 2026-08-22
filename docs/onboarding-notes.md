# Candidate onboarding — files and the three-day plan

## Files

| File | Path in this repo |
|---|---|
| Onboarding migration | `supabase/migrations/0003_onboarding.sql` |
| Onboarding server actions | `app/(candidate)/onboarding/actions.ts` (not yet delivered) |

The wizard UI is next — these two are the parts that have to be right before
anyone touches them, because they're the parts you can't change once 400 rows
exist.

## The five steps, and why they're in that order

1. **What do you do** — role, and a registration number if the role has a regulator
2. **Where and when** — postcode district, radius, availability, shifts, driving
3. **Experience** — at least one job, with real dates
4. **Eligibility** — right to work, DBS
5. **In your own words** — one prompt, skippable

Steps 1–3 are what employers filter on, so they come first: if someone
abandons at step 4 you still have a findable profile. Reverse the order and an
abandoner leaves you nothing.

Publishing needs steps 1–4. Step 5 and the photo are nudges afterwards, not
gates. Getting people visible beats getting them polished — a profile nobody
finished is worth nothing to anybody.

## Why prompts instead of "About me"

Ask four hundred care workers to describe themselves and you get "hardworking
and reliable" four hundred times. Ask *"Something I'm good at that isn't on my
CV"* and you get "I'm the one they send in when a new client won't let anyone
through the door" — which is the sentence that gets someone hired.

Six prompts are seeded in the migration. They pick one. Add more later from
what people actually write.

## Read the funnel on day two, not day four

```sql
select * from onboarding_funnel;
```

You'll have enough data by the end of day one to see where people stop. The
usual culprits, in order: the postcode field (people type the whole postcode
and the validation rejects it), the employment dates (month pickers on Android),
and the DBS block (people don't know whether theirs is on the Update Service).

If step 3 is your drop, make the description optional-looking rather than
optional-in-fact. If step 4 is your drop, add a "I'm not sure" option to the
Update Service question and follow up by email — an unsure answer is far better
than an abandoned form.

**Watch for completion below 60%.** That's the number where the friction is
costing you more than the data is worth, and you should cut a field rather than
push harder.

## Sequencing 400 people over three days

Don't send all 400 invitations at once.

- **Batch one, 40 people, day one morning.** Watch the funnel. Fix what breaks.
- **Batch two, 150, day one evening** — after work, which is when care workers
  are actually on their phones.
- **The rest across days two and three**, with a reminder to anyone from batch
  one who started and stopped.

Staggering isn't caution, it's the only way you get to fix the thing that's
losing you a third of them before it's lost you a third of four hundred.

Send in the evening. Domiciliary carers work split shifts — morning calls,
teatime calls — and the window that works is roughly 8–10pm.

## Before you send anything

- [ ] Custom SMTP live and verified (Resend or Postmark). **Hard blocker.**
- [ ] Magic Link email template switched to `{{ .Token }}`
- [ ] OTP rate limit raised for the launch window, then put back
- [ ] Tested end to end on a real Android phone on mobile data, not a desktop browser
- [ ] The sign-up page says plainly that you're new and starting in North London
- [ ] A privacy notice that actually exists at `/privacy`
- [ ] You've decided what happens when someone completes a profile and no job
      exists for them — even if the answer is just an honest email

## The thing this doesn't solve

Four hundred candidates and one employer is not a marketplace, it's a database.
The wizard makes those profiles good; it can't make them useful. Every day
those people sit there without hearing anything is a day of goodwill you spend.

So the clock that matters isn't the three days to onboard them — it's the weeks
after, before the first fifty realise nothing is coming. Employer recruitment
should be running in parallel, starting now, not after this push lands.

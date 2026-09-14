# Stock photography used on the landing page

All three photos are from Unsplash and are used under the **Unsplash License**
(https://unsplash.com/license): free to use for commercial and non-commercial
purposes, no permission needed, attribution appreciated but not required.

They are **downloaded and bundled into the Worker**, not hotlinked. That's
deliberate and matches the convention set when the employer landing page's
draft was cleaned up (see PROGRESS.md): an external hotlink is fragile, leaks
traffic data to a third party, and leaves licensing unverifiable at a glance.
Serving our own copy fixes all three.

| File | Source photo | Used for |
|---|---|---|
| `hero-clinician.jpg` | https://unsplash.com/photos/photo-1576091160399-112ba8d25d1d | Hero — clinician holding a phone ("your passport, in your pocket") |
| `care-hands.jpg` | https://unsplash.com/photos/photo-1584515933487-779824d29309 | Social care section — carer holding someone's hand |
| `workforce-corridor.jpg` | https://unsplash.com/photos/photo-1516841273335-e39b37888115 | Workforce breadth — clinical team, faces not identifiable |

Fetched 2026-09-14 at `w=1200&q=68` (hero) / `w=900&q=68` (others), JPEG, via
Unsplash's own image CDN resizing parameters — no local re-encoding, so what
ships is exactly what Unsplash served.

None of the three shows an identifiable person in a way that implies they are
an iCare user, which matters: these are illustrative, not testimonials, and the
page never captions them as real candidates.

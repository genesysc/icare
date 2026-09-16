// Unsplash hotlinking — 2026-09-16.
//
// Hotlinking itself needs no API key: Unsplash's CDN serves any photo
// directly at https://images.unsplash.com/photo-{id}, with Imgix-style
// crop/quality params, per their documented public behaviour. What DOES
// need the API (an UNSPLASH_ACCESS_KEY env var, not yet provisioned — see
// HANDOVER.md §9) is per-photographer attribution and triggering the
// download endpoint their API terms require for applications that use the
// API. Until that key exists, credit falls back to a generic, honest
// "Unsplash" line linking to unsplash.com itself — never a guessed
// per-photo URL (unsplash.com/photos/{id} without the real title slug
// 404s, confirmed by hand before writing this).

const UNSPLASH_CDN = "https://images.unsplash.com";

export function unsplashUrl(id: string, w: number, h?: number, q = 75): string {
  const params = new URLSearchParams({ w: String(w), q: String(q), fm: "jpg", fit: "crop", auto: "format" });
  if (h) params.set("h", String(h));
  return `${UNSPLASH_CDN}/photo-${id}?${params.toString()}`;
}

export const heroUrl = (id: string) => unsplashUrl(id, 1600, 900);
export const featuredUrl = (id: string) => unsplashUrl(id, 1200, 750);
export const listThumbUrl = (id: string) => unsplashUrl(id, 480, 360);
export const relatedThumbUrl = (id: string) => unsplashUrl(id, 600, 375);
export const ogImageUrl = (id: string) => unsplashUrl(id, 1200, 630, 80);

export type UnsplashCredit = { name: string; profileUrl: string };

const GENERIC_CREDIT: UnsplashCredit = { name: "Unsplash", profileUrl: "https://unsplash.com/" };

// Real per-photographer credit once UNSPLASH_ACCESS_KEY is set. Not cached
// across requests (no KV binding wired for this yet — traffic is low
// pre-launch; worth adding KV caching if/when volume makes repeat API
// calls per pageview a real cost, flagged rather than built pre-emptively).
export async function resolveUnsplashCredit(id: string, accessKey?: string): Promise<UnsplashCredit> {
  if (!accessKey) return GENERIC_CREDIT;
  try {
    const res = await fetch(`https://api.unsplash.com/photos/${id}`, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });
    if (!res.ok) return GENERIC_CREDIT;
    const data = await res.json<{
      user?: { name?: string; links?: { html?: string } };
      links?: { download_location?: string };
    }>();
    if (data.links?.download_location) {
      // Fire-and-forget per Unsplash API guidelines: trigger once per use.
      fetch(data.links.download_location, { headers: { Authorization: `Client-ID ${accessKey}` } }).catch(() => {});
    }
    if (data.user?.name && data.user.links?.html) {
      return { name: data.user.name, profileUrl: `${data.user.links.html}?utm_source=icare&utm_medium=referral` };
    }
    return GENERIC_CREDIT;
  } catch {
    return GENERIC_CREDIT;
  }
}

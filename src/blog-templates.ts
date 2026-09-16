// Blog page templates — 2026-09-16.
//
// Ported from design/icare-blog-prototype.html (the approved visual
// reference, see HANDOVER.md in the blog handover package) into real
// server-rendered Hono routes instead of the prototype's client-side hash
// router — this repo has no framework, every other page is self-contained
// HTML rendered by the Worker, and the blog follows the same pattern.
// CSS is ported verbatim (same custom properties, same class names) so
// nothing drifts from what was already designed and reviewed.
//
// One real, deliberate adaptation from the prototype: its waitlist-capture
// band assumed candidates were still pre-launch. They aren't — the
// 2026-09-14 landing rebuild replaced landing.html's own waitlist form
// with real /sign-up and /sign-in CTAs once the candidate product went
// live (see PROGRESS.md). The blog's conversion band and article CTA do
// the same here: real sign-up links, not a stale email-capture form next
// to an already-live signup flow. Employers still have a real waitlist
// (employers.html) — that's untouched, out of scope for the blog.

import type { BlogPost, BlogSource, BlogFaqItem } from "./blog-content";
import { heroUrl, featuredUrl, listThumbUrl, relatedThumbUrl } from "./blog-images";
import type { UnsplashCredit } from "./blog-images";

export const SITE = "https://icareltd.com";

export const CATEGORY_LIST: { name: string; slug: string }[] = [
  { name: "Social Care", slug: "social-care" },
  { name: "NHS & Clinical Careers", slug: "nhs-clinical-careers" },
  { name: "Pharmacy & Pharma", slug: "pharmacy-pharma" },
  { name: "Independent Healthcare", slug: "independent-healthcare" },
  { name: "Immigration & Sponsorship", slug: "immigration-sponsorship" },
  { name: "Workforce Policy", slug: "workforce-policy" },
];

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export const BLOG_CSS = `
:root{
  --purple:#330072; --purple-deep:#1F0047; --teal:#00A499; --teal-ink:#007A72; --lavender:#F4F1F8;
  --lavender-2:#E7E0F0; --paper:#FFFFFF; --ink:#1B1530; --muted:#5E5673; --rule:#DCD3E8;
  --serif:"Fraunces", Georgia, "Times New Roman", serif;
  --sans:"Public Sans", system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
  --mono:"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  --measure:40rem;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#130B22; --ink:#F1ECF8; --muted:#B7ADCB; --lavender:#1E1433; --lavender-2:#2A1D45; --rule:#3A2C55;
    --purple:#C9B3F2; --purple-deep:#2A1650; --teal:#2DD4C4; --teal-ink:#5EE3D6;
  }
}
:root[data-theme="dark"]{
  --paper:#130B22; --ink:#F1ECF8; --muted:#B7ADCB; --lavender:#1E1433; --lavender-2:#2A1D45; --rule:#3A2C55;
  --purple:#C9B3F2; --purple-deep:#2A1650; --teal:#2DD4C4; --teal-ink:#5EE3D6;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:400 1.0625rem/1.65 var(--sans);overflow-x:hidden}
img{max-width:100%;height:auto;display:block}
a{color:var(--teal-ink);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--teal);outline-offset:3px;border-radius:2px}
.wrap{max-width:74rem;margin:0 auto;padding:0 1.25rem}
.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:var(--paper);padding:.5rem 1rem;z-index:9}
.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}

.mast{border-bottom:1px solid var(--rule);background:var(--paper);position:sticky;top:0;z-index:5}
.mast .wrap{display:flex;align-items:center;gap:1.5rem;min-height:4rem}
.logo{font:600 1.6rem/1 var(--serif);color:var(--purple);text-decoration:none;letter-spacing:-.01em}
.logo span{color:var(--teal)}
.mast nav{display:flex;gap:1.25rem;margin-left:auto;align-items:center}
.mast nav a{color:var(--ink);text-decoration:none;font-weight:500;font-size:.95rem}
.mast nav a[aria-current]{color:var(--purple);box-shadow:inset 0 -2px 0 var(--teal)}
.btn,.mast nav a.btn{display:inline-flex;align-items:center;gap:.5rem;background:var(--teal-ink);color:#fff;border:0;border-radius:999px;padding:.6rem 1.1rem;font:600 .95rem/1 var(--sans);text-decoration:none;cursor:pointer}
.btn:hover,.mast nav a.btn:hover{background:#005F58}
@media (max-width:720px){.mast nav .hide-sm{display:none}}

.intro{padding:3.5rem 0 2rem}
.intro h1{font:500 clamp(2.6rem,6vw,4.4rem)/1.02 var(--serif);color:var(--purple);margin:0 0 .75rem;letter-spacing:-.01em;font-variation-settings:"opsz" 110}
.intro p{max-width:36rem;color:var(--muted);font-size:1.15rem;margin:0}
.filters{display:flex;gap:.5rem;overflow-x:auto;padding:.25rem 0 1.25rem;scrollbar-width:none;margin-bottom:1rem;border-bottom:1px solid var(--rule)}
.filters a{flex:0 0 auto;border:1px solid var(--rule);background:transparent;color:var(--ink);border-radius:999px;padding:.45rem .95rem;font:500 .9rem/1 var(--sans);cursor:pointer;text-decoration:none}
.filters a[aria-current]{background:var(--purple);border-color:var(--purple);color:var(--paper)}
.feature{display:grid;grid-template-columns:1.35fr 1fr;gap:2.5rem;align-items:center;padding:2rem 0 3rem;border-bottom:1px solid var(--rule);text-decoration:none;color:inherit}
.feature img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;border-radius:4px 48px 4px 4px}
.cat{font:500 .8rem/1.2 var(--mono);color:var(--teal-ink);text-decoration:none}
.feature h2{font:500 clamp(1.8rem,3.4vw,2.7rem)/1.08 var(--serif);color:var(--ink);margin:.6rem 0 .9rem;letter-spacing:-.015em}
.feature:hover h2,.row:hover h3{color:var(--purple)}
.feature p{color:var(--muted);margin:0 0 1rem;font-size:1.05rem}
.meta{font:400 .8rem/1.4 var(--mono);color:var(--muted)}
.list{list-style:none;margin:0;padding:0}
.row{display:grid;grid-template-columns:8.5rem 1fr 13rem;gap:1.75rem;padding:1.75rem 0;border-bottom:1px solid var(--rule);text-decoration:none;color:inherit;align-items:start}
.row .date{font:400 .8rem/1.5 var(--mono);color:var(--muted);padding-top:.3rem}
.row h3{font:500 1.5rem/1.15 var(--serif);margin:.35rem 0 .5rem;color:var(--ink);letter-spacing:-.01em}
.row p{margin:0;color:var(--muted);font-size:1rem;max-width:38rem}
.row img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:4px}
@media (max-width:860px){
  .feature{grid-template-columns:1fr;gap:1.25rem}
  .row{grid-template-columns:1fr 6.5rem;gap:1rem}
  .row .date{grid-column:1/-1;order:-1;padding:0}
  .row h3{font-size:1.2rem}
  .row p{display:none}
}
.band{background:var(--purple-deep);color:#F4F1F8;margin:4rem 0 0;padding:3.5rem 0}
.band .wrap{display:grid;grid-template-columns:1.2fr 1fr;gap:2rem;align-items:center}
.band h2{font:500 clamp(1.7rem,3vw,2.4rem)/1.1 var(--serif);margin:0 0 .5rem;color:#fff}
.band p{margin:0;color:#D9CFEA}
.band .cta-row{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}
.band .btn-ghost{display:inline-flex;align-items:center;background:transparent;color:#fff;border:1px solid #6E58A0;border-radius:999px;padding:.6rem 1.1rem;font:600 .95rem/1 var(--sans);text-decoration:none}
.band .btn-ghost:hover{border-color:#fff}
@media (max-width:760px){.band .wrap{grid-template-columns:1fr}}
footer.site{padding:2rem 0 5rem;color:var(--muted);font-size:.85rem}
footer.site .wrap{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;align-items:center;justify-content:space-between}
footer.site .flinks{display:flex;gap:1rem;flex-wrap:wrap}
footer.site a{color:var(--muted)}

.crumbs{font:400 .8rem/1.4 var(--mono);color:var(--muted);padding:1.75rem 0 0}
.crumbs a{color:var(--muted)}
.head{max-width:52rem;padding:1.5rem 0 2rem}
.head h1{font:500 clamp(2.1rem,5vw,3.6rem)/1.08 var(--serif);color:var(--purple);margin:.7rem 0 1rem;letter-spacing:-.005em;font-variation-settings:"opsz" 96}
.standfirst{font:400 1.25rem/1.5 var(--sans);color:var(--muted);margin:0 0 1.25rem;max-width:44rem}
.byline{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;font:400 .8rem/1.5 var(--mono);color:var(--muted)}
.hero figure{margin:0}
.hero img{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:4px 64px 4px 4px}
.hero figcaption{font:400 .75rem/1.4 var(--mono);color:var(--muted);margin-top:.5rem}
.layout{display:grid;grid-template-columns:3.5rem minmax(0,var(--measure)) 1fr;gap:2.5rem;padding:2.5rem 0 1rem}
.share-rail{position:sticky;top:6rem;align-self:start;display:flex;flex-direction:column;gap:.5rem}
.share-rail .lbl{font:500 .7rem/1 var(--mono);color:var(--muted);margin-bottom:.25rem}
.sbtn{width:2.6rem;height:2.6rem;border-radius:50%;border:1px solid var(--rule);display:grid;place-items:center;color:var(--purple);background:var(--paper);cursor:pointer;text-decoration:none;padding:0}
.sbtn:hover{border-color:var(--teal);color:var(--teal-ink)}
.sbtn svg{width:1.05rem;height:1.05rem;fill:currentColor}
.toc{position:sticky;top:6rem;align-self:start;font-size:.9rem;border-left:2px solid var(--lavender-2);padding-left:1rem;max-width:16rem}
.toc p{font:500 .75rem/1 var(--mono);color:var(--muted);margin:0 0 .75rem}
.toc ol{list-style:none;margin:0;padding:0;display:grid;gap:.55rem}
.toc a{color:var(--muted);text-decoration:none;line-height:1.35;display:block}
.toc a.on{color:var(--purple);font-weight:600}
.prose{min-width:0}
.prose > p:first-of-type{font-size:1.2rem;line-height:1.55}
.prose h2{font:500 1.85rem/1.15 var(--serif);color:var(--purple);margin:2.75rem 0 .75rem;letter-spacing:-.01em;scroll-margin-top:6rem}
.prose h3{font:600 1.15rem/1.3 var(--sans);margin:2rem 0 .5rem;scroll-margin-top:6rem}
.prose p,.prose li{max-width:var(--measure)}
.prose ul,.prose ol{padding-left:1.25rem}
.prose li{margin:.35rem 0}
.prose li::marker{color:var(--teal)}
.prose strong{font-weight:700;color:var(--ink)}
.notice{background:var(--lavender);border-left:3px solid var(--teal);margin:0 0 2rem;padding:1rem 1.25rem;border-radius:0 6px 6px 0;font-size:.95rem}
.notice p{margin:0}
.bottom-line{background:var(--lavender);margin:3rem -1.5rem 0;padding:.5rem 1.5rem 1.5rem;border-radius:4px 40px 4px 4px}
.bottom-line h2{margin-top:1.5rem}
.faq{margin:3rem 0 0}
.faq h2{font:500 1.85rem/1.15 var(--serif);color:var(--purple);margin:0 0 1rem}
.faq details{border-top:1px solid var(--rule);padding:.9rem 0}
.faq details:last-child{border-bottom:1px solid var(--rule)}
.faq summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:1rem}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font:400 1.4rem/1 var(--sans);color:var(--teal-ink)}
.faq details[open] summary::after{content:"\\2212"}
.faq details p{margin:.6rem 0 0;color:var(--muted)}
.sources{margin:3rem 0 0;padding-top:1.5rem;border-top:2px solid var(--purple)}
.sources h2{font:600 1rem/1.3 var(--sans);margin:0 0 .75rem;color:var(--ink)}
.sources ol{margin:0;padding-left:1.5rem;font-size:.9rem;color:var(--muted);display:grid;gap:.45rem}
.sources ol li::marker{font-family:var(--mono);color:var(--teal-ink)}
.sources .pub{color:var(--muted)}
.share-inline{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:2.5rem 0 0;padding:1.25rem 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.share-inline .lbl{font-weight:600;margin-right:.5rem}
.cta{display:grid;grid-template-columns:1fr auto;gap:1.5rem;align-items:center;background:var(--purple-deep);color:#F4F1F8;border-radius:4px 48px 4px 4px;padding:2rem;margin:3rem 0 0}
.cta h2{font:500 1.6rem/1.15 var(--serif);margin:0 0 .35rem;color:#fff}
.cta p{margin:0;color:#D9CFEA}
@media (max-width:640px){.cta{grid-template-columns:1fr}}
.related{padding:3rem 0 1rem;border-top:1px solid var(--rule);margin-top:3rem}
.related h2{font:500 1.6rem/1.2 var(--serif);color:var(--purple);margin:0 0 1rem}
.related-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2rem}
.related-grid a{text-decoration:none;color:inherit}
.related-grid img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;border-radius:4px;margin-bottom:.75rem}
.related-grid h3{font:500 1.15rem/1.25 var(--serif);margin:.35rem 0 0;color:var(--ink)}
@media (max-width:1080px){.layout{grid-template-columns:3.5rem minmax(0,1fr)}.toc{display:none}}
.mobile-share{display:none;position:fixed;left:0;right:0;bottom:0;z-index:6;background:var(--paper);border-top:1px solid var(--rule);padding:.6rem 1rem;gap:.5rem;justify-content:space-between;align-items:center}
.mobile-share .sbtn{width:2.4rem;height:2.4rem}
@media (max-width:760px){
  .layout{grid-template-columns:1fr;padding-top:1.5rem}
  .share-rail{display:none}
  .related-grid{grid-template-columns:1fr}
  .bottom-line{margin-left:-1.25rem;margin-right:-1.25rem;border-radius:0}
  .mobile-share{display:flex}
}
.toast{position:fixed;left:50%;bottom:5rem;transform:translateX(-50%);background:var(--ink);color:var(--paper);padding:.6rem 1rem;border-radius:999px;font-size:.9rem;opacity:0;pointer-events:none;transition:opacity .2s}
.toast.show{opacity:1}
.progress{position:fixed;top:0;left:0;height:3px;background:var(--teal);width:0;z-index:7}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;

const ICONS: Record<string, string> = {
  linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11H3zM9.5 9.75h3.8v1.5h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1v5.45h-4v-4.83c0-1.15-.02-2.63-1.6-2.63-1.6 0-1.85 1.25-1.85 2.55v4.91h-4z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.75 3h3.1l-6.77 7.74L22 21h-6.23l-4.88-6.38L5.3 21H2.2l7.24-8.28L1.9 3h6.39l4.41 5.83zm-1.09 16.2h1.72L7.43 4.72H5.59z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5h2.52l.38-2.93h-2.9V8.7c0-.85.24-1.43 1.45-1.43h1.55V4.65a20.6 20.6 0 0 0-2.26-.12c-2.24 0-3.77 1.37-3.77 3.88v2.16H8v2.93h2.47V21z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.98L2 22l5.16-1.5A9.9 9.9 0 1 0 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.06.89.9-2.98-.2-.31a8.2 8.2 0 1 1 6.84 3.72zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.17.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.34-2.92c-.25-.43.25-.4.72-1.34.08-.16.04-.3-.02-.43l-.75-1.8c-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.73 2.73 0 0 0-.85 2.03 4.74 4.74 0 0 0 1 2.52 10.86 10.86 0 0 0 4.16 3.67c1.55.67 2.15.73 2.93.61.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.17-.06-.1-.22-.16-.47-.28z"/></svg>',
  email: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4 7.3V17h16V7.3zM18.9 7H5.1L12 11.1z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zM7.05 20.95a4.5 4.5 0 0 1-3.18-7.68l2.83-2.83a1 1 0 0 1 1.41 1.42l-2.83 2.82a2.5 2.5 0 1 0 3.54 3.54l2.82-2.83a1 1 0 0 1 1.42 1.41l-2.83 2.83a4.47 4.47 0 0 1-3.18 1.32zm9.54-7.68a1 1 0 0 1-.7-1.71l2.82-2.83a2.5 2.5 0 1 0-3.54-3.54L12.35 8a1 1 0 0 1-1.42-1.41l2.83-2.83a4.5 4.5 0 0 1 6.36 6.36L17.3 12.97a1 1 0 0 1-.71.3z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.1c-.8 0-1.5.3-2 .8l-7.1-4.1c.1-.3.1-.5.1-.8s0-.5-.1-.8L16 7.1c.5.5 1.2.8 2 .8a3 3 0 1 0-3-3c0 .3 0 .5.1.8L8 9.8a3 3 0 1 0 0 4.4l7.1 4.2c-.1.2-.1.4-.1.7a3 3 0 1 0 3-3z"/></svg>',
};

function shareLinks(post: BlogPost): { k: string; label: string; href: string }[] {
  const base = `${SITE}/blog/${post.slug}`;
  const title = encodeURIComponent(post.title);
  const mk = (platform: string) => encodeURIComponent(`${base}?utm_source=${platform}&utm_medium=social&utm_campaign=blog_share`);
  return [
    { k: "linkedin", label: "Share on LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${mk("linkedin")}` },
    { k: "x", label: "Share on X", href: `https://twitter.com/intent/tweet?url=${mk("x")}&text=${title}` },
    { k: "facebook", label: "Share on Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${mk("facebook")}` },
    { k: "whatsapp", label: "Share on WhatsApp", href: `https://wa.me/?text=${title}%20${mk("whatsapp")}` },
    { k: "email", label: "Share by email", href: `mailto:?subject=${title}&body=${mk("email")}` },
  ];
}

function shareButtonsHtml(post: BlogPost): string {
  const links = shareLinks(post)
    .map(
      (s) =>
        `<a class="sbtn" href="${s.href}" target="_blank" rel="noopener" aria-label="${s.label}" title="${s.label}" data-share="${s.k}" data-slug="${esc(post.slug)}">${ICONS[s.k]}</a>`
    )
    .join("");
  const copy = `<button class="sbtn" type="button" data-copy="${SITE}/blog/${post.slug}?utm_source=copy_link&utm_medium=social&utm_campaign=blog_share" data-slug="${esc(post.slug)}" aria-label="Copy link" title="Copy link">${ICONS.link}</button>`;
  return links + copy;
}

function blogHeader(active: "blog" | "" = ""): string {
  return `<header class="mast">
  <div class="wrap">
    <a class="logo" href="/" aria-label="iCare home">i<span>Care</span></a>
    <nav aria-label="Main">
      <a class="hide-sm" href="/employers">For employers</a>
      <a href="/blog"${active === "blog" ? ' aria-current="page"' : ""}>Insights</a>
      <a class="hide-sm" href="/sign-in">Log in</a>
      <a class="btn" href="/sign-up">Sign up</a>
    </nav>
  </div>
</header>`;
}

function blogFooter(): string {
  return `<footer class="site">
  <div class="wrap">
    <p>&copy; ${new Date().getUTCFullYear()} iCare. Photos from Unsplash.</p>
    <div class="flinks">
      <a href="/blog">Insights</a>
      <a href="/employers">For employers</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/blog/feed.xml">RSS</a>
    </div>
  </div>
</footer>`;
}

function joinBand(): string {
  return `<section class="band" aria-labelledby="wl">
  <div class="wrap">
    <div><h2 id="wl">Build a career record that goes with you.</h2>
    <p>iCare is the professional network for everyone who works in UK health and social care.</p></div>
    <div class="cta-row">
      <a class="btn" href="/sign-up">Sign up free</a>
      <a class="btn-ghost" href="/sign-in">Log in</a>
    </div>
  </div>
</section>`;
}

function headTags(opts: {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogType?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  jsonLd: object[];
}): string {
  const og = opts.ogImage
    ? `<meta property="og:image" content="${esc(opts.ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(opts.ogImageAlt || opts.title)}">`
    : "";
  const articleTags =
    opts.ogType === "article"
      ? `<meta property="article:published_time" content="${esc(opts.publishedTime)}">
<meta property="article:modified_time" content="${esc(opts.modifiedTime)}">
<meta property="article:section" content="${esc(opts.section)}">`
      : "";
  return `<title>${esc(opts.title)} | iCare</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(opts.canonical)}">
<link rel="alternate" type="application/rss+xml" title="iCare Insights" href="${SITE}/blog/feed.xml">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:site_name" content="iCare">
<meta property="og:locale" content="en_GB">
<meta property="og:type" content="${opts.ogType || "website"}">
<meta property="og:url" content="${esc(opts.canonical)}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
${og}
${articleTags}
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<style>${BLOG_CSS}</style>
${opts.jsonLd.map((ld) => `<script type="application/ld+json">${JSON.stringify(ld)}</script>`).join("\n")}`;
}

// ---------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "iCare",
    url: SITE,
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "iCare",
    url: SITE,
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function faqJsonLd(faq: BlogFaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function blogPostingJsonLd(post: BlogPost) {
  const url = `${SITE}/blog/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDescription,
    image: [heroUrl(post.heroImage.unsplashId)],
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    author: { "@type": "Organization", name: "iCare" },
    publisher: { "@type": "Organization", name: "iCare", url: SITE },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.category,
    keywords: [post.primaryKeyword, ...post.secondaryKeywords].join(", "),
    wordCount: post.wordCount,
    inLanguage: "en-GB",
    citation: post.sources.map((s: BlogSource) => s.url),
  };
}

export function blogIndexJsonLd(posts: BlogPost[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "iCare Insights",
    url: `${SITE}/blog`,
    blogPost: {
      "@type": "ItemList",
      itemListElement: posts.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}/blog/${p.slug}`,
      })),
    },
  };
}

// ---------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------

export function renderIndexPage(posts: BlogPost[]): string {
  const featured = posts.find((p) => p.featured) || posts[0];
  const rest = posts.filter((p) => p !== featured);
  const jsonLd = [organizationJsonLd(), websiteJsonLd(), blogIndexJsonLd(posts)];
  const head = headTags({
    title: "Insights",
    description: "Workforce news, careers and policy across UK health and social care, explained plainly.",
    canonical: `${SITE}/blog`,
    jsonLd,
  });

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${blogHeader("blog")}
<main id="main">
  <div class="wrap">
    <section class="intro">
      <h1>Insights</h1>
      <p>Workforce news, careers and policy across UK health and social care, explained plainly.</p>
    </section>
    <div class="filters" role="toolbar" aria-label="Filter by topic">
      <a aria-current="true" href="/blog">All</a>
      ${CATEGORY_LIST.map((c) => `<a href="/blog/category/${c.slug}">${esc(c.name)}</a>`).join("\n      ")}
    </div>
    ${
      featured
        ? `<a class="feature" href="/blog/${featured.slug}">
      <img src="${featuredUrl(featured.heroImage.unsplashId)}" alt="${esc(featured.heroImage.alt)}" width="1200" height="750" loading="eager">
      <div>
        <span class="cat">${esc(featured.category)}</span>
        <h2>${esc(featured.title)}</h2>
        <p>${esc(featured.metaDescription)}</p>
        <span class="meta">${fmtDate(featured.datePublished)} &nbsp; ${featured.readingTime} min read</span>
      </div>
    </a>`
        : ""
    }
    <ul class="list">
      ${rest
        .map(
          (p) => `<li><a class="row" href="/blog/${p.slug}">
        <span class="date">${fmtDate(p.datePublished)}</span>
        <div><span class="cat">${esc(p.category)}</span><h3>${esc(p.title)}</h3><p>${esc(p.metaDescription)}</p></div>
        <img src="${listThumbUrl(p.heroImage.unsplashId)}" alt="" loading="lazy" width="480" height="360">
      </a></li>`
        )
        .join("\n      ")}
    </ul>
  </div>
  ${joinBand()}
  ${blogFooter()}
</main>
</body>
</html>`;
}

export function renderCategoryHubPage(categorySlug: string, categoryName: string, posts: BlogPost[]): string {
  const jsonLd = [
    organizationJsonLd(),
    breadcrumbJsonLd([
      { name: "Insights", url: `${SITE}/blog` },
      { name: categoryName, url: `${SITE}/blog/category/${categorySlug}` },
    ]),
  ];
  const head = headTags({
    title: categoryName,
    description: `${categoryName} news, careers and policy from iCare Insights — workforce coverage for UK health and social care.`,
    canonical: `${SITE}/blog/category/${categorySlug}`,
    jsonLd,
  });

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${blogHeader("blog")}
<main id="main">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/blog">Insights</a> / ${esc(categoryName)}</nav>
    <section class="intro">
      <h1>${esc(categoryName)}</h1>
      <p>${posts.length} article${posts.length === 1 ? "" : "s"} on ${esc(categoryName).toLowerCase()}, from iCare Insights.</p>
    </section>
    <div class="filters" role="toolbar" aria-label="Filter by topic">
      <a href="/blog">All</a>
      ${CATEGORY_LIST.map((c) => `<a href="/blog/category/${c.slug}"${c.slug === categorySlug ? ' aria-current="true"' : ""}>${esc(c.name)}</a>`).join("\n      ")}
    </div>
    <ul class="list">
      ${posts
        .map(
          (p) => `<li><a class="row" href="/blog/${p.slug}">
        <span class="date">${fmtDate(p.datePublished)}</span>
        <div><span class="cat">${esc(p.category)}</span><h3>${esc(p.title)}</h3><p>${esc(p.metaDescription)}</p></div>
        <img src="${listThumbUrl(p.heroImage.unsplashId)}" alt="" loading="lazy" width="480" height="360">
      </a></li>`
        )
        .join("\n      ")}
    </ul>
  </div>
  ${joinBand()}
  ${blogFooter()}
</main>
</body>
</html>`;
}

export function renderArticlePage(post: BlogPost, related: BlogPost[], credit: UnsplashCredit): string {
  const url = `${SITE}/blog/${post.slug}`;
  const jsonLd = [
    organizationJsonLd(),
    breadcrumbJsonLd([
      { name: "Insights", url: `${SITE}/blog` },
      { name: post.category, url: `${SITE}/blog/category/${post.categorySlug}` },
      { name: post.title, url },
    ]),
    blogPostingJsonLd(post),
    faqJsonLd(post.faq),
  ];
  const head = headTags({
    title: post.seoTitle,
    description: post.metaDescription,
    canonical: url,
    ogImage: `${SITE}/blog/${post.slug}/opengraph-image`,
    ogImageAlt: post.heroImage.alt,
    ogType: "article",
    publishedTime: post.datePublished,
    modifiedTime: post.dateModified,
    section: post.category,
    jsonLd,
  });

  const disclaimer = post.disclaimer ? `<aside class="notice" role="note"><p>${esc(post.disclaimer)}</p></aside>` : "";

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="progress" id="progress" aria-hidden="true"></div>
${blogHeader("blog")}
<main id="main">
  <article class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/blog">Insights</a> / <a href="/blog/category/${post.categorySlug}">${esc(post.category)}</a></nav>
    <header class="head">
      <a class="cat" href="/blog/category/${post.categorySlug}">${esc(post.category)}</a>
      <h1>${esc(post.title)}</h1>
      <p class="standfirst">${esc(post.metaDescription)}</p>
      <div class="byline">
        <span>By ${esc(post.author)}</span>
        <span>Published ${fmtDate(post.datePublished)}</span>
        ${post.dateModified !== post.datePublished ? `<span>Updated ${fmtDate(post.dateModified)}</span>` : ""}
        <span>${post.readingTime} min read</span>
      </div>
    </header>
    <div class="hero"><figure>
      <img src="${heroUrl(post.heroImage.unsplashId)}" alt="${esc(post.heroImage.alt)}" width="1600" height="900" fetchpriority="high">
      <figcaption>${
        credit.name === "Unsplash"
          ? `Photo via <a href="${esc(credit.profileUrl)}" target="_blank" rel="noopener">Unsplash</a>`
          : `Photo: <a href="${esc(credit.profileUrl)}" target="_blank" rel="noopener">${esc(credit.name)}</a> on <a href="https://unsplash.com/?utm_source=icare&amp;utm_medium=referral" target="_blank" rel="noopener">Unsplash</a>`
      }</figcaption>
    </figure></div>
    <div class="layout">
      <aside class="share-rail" aria-label="Share this article"><span class="lbl">Share</span>${shareButtonsHtml(post)}</aside>
      <div class="prose">
        ${disclaimer}
        ${post.bodyHtml}
        <div class="share-inline"><span class="lbl">Found this useful? Share it.</span>${shareButtonsHtml(post)}</div>
        <section class="faq" aria-labelledby="faq-h"><h2 id="faq-h">Frequently asked questions</h2>
          ${post.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n          ")}
        </section>
        <section class="sources" aria-labelledby="src-h"><h2 id="src-h">Sources and further reading</h2>
          <ol>${post.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}<span class="visually-hidden"> (opens in new tab)</span></a> <span class="pub">${esc(s.publisher)}</span></li>`).join("")}</ol>
        </section>
        <aside class="cta"><div><h2>Your career, on the record.</h2><p>Keep your qualifications, training and experience in one professional profile built for UK health and social care.</p></div><a class="btn" href="/sign-up">Sign up free</a></aside>
      </div>
      <nav class="toc" aria-label="On this page"><p>On this page</p><ol>${post.toc.map((t) => `<li><a href="#${t.id}" data-id="${t.id}">${esc(t.text)}</a></li>`).join("")}</ol></nav>
    </div>
    ${
      related.length
        ? `<section class="related" aria-labelledby="rel-h"><h2 id="rel-h">Keep reading</h2>
      <div class="related-grid">${related
        .map(
          (r) =>
            `<a href="/blog/${r.slug}"><img src="${relatedThumbUrl(r.heroImage.unsplashId)}" alt="" loading="lazy" width="600" height="375"><span class="cat">${esc(r.category)}</span><h3>${esc(r.title)}</h3></a>`
        )
        .join("")}</div>
    </section>`
        : ""
    }
  </article>
  <div class="mobile-share" aria-label="Share this article">${shareButtonsHtml(post)}<button class="sbtn" type="button" data-native aria-label="More sharing options">${ICONS.share}</button></div>
  ${blogFooter()}
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
(function () {
  var $ = function (s, el) { return (el || document).querySelector(s); };
  document.addEventListener("click", function (e) {
    var copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) {
      var v = copyBtn.dataset.copy;
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () {
        toast("Link copied");
      }).catch(function () { toast(v); });
    }
    var shareBtn = e.target.closest("[data-share]");
    if (shareBtn) {
      try {
        var evt = { platform: shareBtn.dataset.share, slug: shareBtn.dataset.slug };
        if (window.gtag) window.gtag("event", "share_click", evt);
        if (window.plausible) window.plausible("share_click", { props: evt });
      } catch (err) {}
    }
  });
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 1800); }

  var nat = $("[data-native]");
  if (nat) {
    if (!navigator.share) { nat.remove(); }
    else { nat.onclick = function () { navigator.share({ title: document.title, url: location.href }).catch(function () {}); }; }
  }

  document.querySelectorAll(".toc a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var el = document.getElementById(a.dataset.id);
      if (el) el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      history.replaceState(null, "", "#" + a.dataset.id);
    });
  });
  var heads = Array.prototype.slice.call(document.querySelectorAll(".prose h2[id]"));
  if (heads.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          document.querySelectorAll(".toc a").forEach(function (a) {
            a.classList.toggle("on", a.dataset.id === entry.target.id);
          });
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    heads.forEach(function (h) { io.observe(h); });
  }

  var progress = $("#progress");
  addEventListener("scroll", function () {
    var d = document.documentElement;
    progress.style.width = (100 * d.scrollTop / Math.max(1, d.scrollHeight - d.clientHeight)) + "%";
  }, { passive: true });
})();
</script>
</body>
</html>`;
}

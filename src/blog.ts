import { Hono } from "hono";
import { BLOG_POSTS } from "./blog-content";
import type { BlogPost } from "./blog-content";
import {
  CATEGORY_LIST,
  SITE,
  esc,
  fmtDate,
  renderArticlePage,
  renderCategoryHubPage,
  renderIndexPage,
} from "./blog-templates";
import { heroUrl, ogImageUrl, resolveUnsplashCredit } from "./blog-images";

type Bindings = {
  UNSPLASH_ACCESS_KEY?: string;
};

const blog = new Hono<{ Bindings: Bindings }>();

function findPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

function relatedFor(post: BlogPost): BlogPost[] {
  const bySlug = (post.relatedPosts || [])
    .map((s) => findPost(s))
    .filter((p): p is BlogPost => Boolean(p));
  if (bySlug.length >= 3) return bySlug.slice(0, 3);
  // Fall back to same-category, then tag overlap — per HANDOVER.md §4.
  const seen = new Set(bySlug.map((p) => p.slug));
  const sameCategory = BLOG_POSTS.filter((p) => p.slug !== post.slug && !seen.has(p.slug) && p.category === post.category);
  const combined = [...bySlug, ...sameCategory];
  const seen2 = new Set(combined.map((p) => p.slug));
  const tagOverlap = BLOG_POSTS.filter(
    (p) => p.slug !== post.slug && !seen2.has(p.slug) && p.tags.some((t) => post.tags.includes(t))
  );
  return [...combined, ...tagOverlap].slice(0, 3);
}

// Registration order matters in Hono for overlapping path shapes — these
// fixed-segment routes must come before the catch-all "/:slug" below.
blog.get("/", (c) => c.html(renderIndexPage(BLOG_POSTS)));

blog.get("/feed.xml", (c) => {
  const items = BLOG_POSTS.map(
    (p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${SITE}/blog/${p.slug}</link>
    <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
    <description>${esc(p.metaDescription)}</description>
    <pubDate>${new Date(p.datePublished + "T12:00:00Z").toUTCString()}</pubDate>
    <category>${esc(p.category)}</category>
  </item>`
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>iCare Insights</title>
  <link>${SITE}/blog</link>
  <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml" />
  <description>Workforce news, careers and policy across UK health and social care, explained plainly.</description>
  <language>en-GB</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;
  return c.text(xml, 200, { "Content-Type": "application/rss+xml; charset=utf-8" });
});

blog.get("/category/:categorySlug", (c) => {
  const slug = c.req.param("categorySlug");
  const category = CATEGORY_LIST.find((cat) => cat.slug === slug);
  if (!category) return c.notFound();
  const posts = BLOG_POSTS.filter((p) => p.categorySlug === slug);
  return c.html(renderCategoryHubPage(slug, category.name, posts));
});

blog.get("/:slug/opengraph-image", async (c) => {
  const post = findPost(c.req.param("slug"));
  if (!post) return c.notFound();
  // Simplified from the original spec's branded ImageResponse composite —
  // no Next.js/Satori-equivalent exists in this Workers runtime without a
  // real added dependency (see HANDOVER.md). A real, correctly-sized
  // 1200x630 crop of the hero image today; a text-overlay card is a
  // scoped-out enhancement, not silently dropped.
  return c.redirect(ogImageUrl(post.heroImage.unsplashId), 302);
});

blog.get("/:slug", async (c) => {
  const post = findPost(c.req.param("slug"));
  if (!post) return c.notFound();
  const credit = await resolveUnsplashCredit(post.heroImage.unsplashId, c.env.UNSPLASH_ACCESS_KEY);
  return c.html(renderArticlePage(post, relatedFor(post), credit));
});

export default blog;
export { BLOG_POSTS, CATEGORY_LIST, findPost, fmtDate, heroUrl };

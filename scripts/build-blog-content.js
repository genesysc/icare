// Blog content build step — 2026-09-16.
//
// This repo has no framework/build pipeline (see HANDOVER.md §2 — Cloudflare
// Workers + Hono, self-contained HTML, "no build step beyond wrangler
// deploy"). Blog posts are the one piece of content that genuinely
// benefits from being authored as Markdown+frontmatter rather than hand-
// written HTML, so this script is the equivalent of that convention for
// them: run it once whenever a post in content/posts/*.md is added or
// edited, commit the regenerated src/blog-content.ts alongside it, same
// as any other committed, pre-rendered content in this repo. The Worker
// itself never parses Markdown at request time — no new runtime
// dependency, just a content-authoring tool (marked/js-yaml are
// devDependencies only).
//
// Usage: node scripts/build-blog-content.js

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { marked } = require("marked");

const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const OUT_FILE = path.join(ROOT, "src", "blog-content.ts");

const VALID_CATEGORIES = [
  "Social Care",
  "NHS & Clinical Careers",
  "Pharmacy & Pharma",
  "Independent Healthcare",
  "Immigration & Sponsorship",
  "Workforce Policy",
];

const CATEGORY_SLUGS = {
  "Social Care": "social-care",
  "NHS & Clinical Careers": "nhs-clinical-careers",
  "Pharmacy & Pharma": "pharmacy-pharma",
  "Independent Healthcare": "independent-healthcare",
  "Immigration & Sponsorship": "immigration-sponsorship",
  "Workforce Policy": "workforce-policy",
};

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Same three post-processing passes build_prototype.py applied (the
// approved reference implementation) — kept behaviourally identical so
// the shipped pages match what was already reviewed against the prototype.
function postProcessHtml(html) {
  // External links: open in new tab. Deliberately no nofollow — citing
  // authoritative sources is part of topical authority (HANDOVER §5).
  html = html.replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener"');
  // Blockquote (disclaimer) -> notice callout.
  html = html.replaceAll("<blockquote>", '<aside class="notice" role="note">').replaceAll("</blockquote>", "</aside>");
  // Wrap "The bottom line" section (and everything after it) in the callout.
  const m = html.match(/<h2 id="the-bottom-line">/);
  if (m) {
    const idx = html.indexOf(m[0]);
    html = html.slice(0, idx) + '<section class="bottom-line">' + html.slice(idx) + "</section>";
  }
  return html;
}

function renderMarkdown(body) {
  const toc = [];
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = tokens.map((t) => ("text" in t ? t.text : "")).join("");
    const id = slugify(text);
    if (depth === 2) toc.push({ id, text });
    return `<h${depth} id="${id}">${marked.parseInline(text)}</h${depth}>\n`;
  };
  const html = marked.parse(body, { renderer, gfm: true, breaks: false });
  return { html: postProcessHtml(html), toc };
}

function wordCount(markdownBody) {
  const stripped = markdownBody
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>-]/g, " ");
  return stripped.split(/\s+/).filter(Boolean).length;
}

function parsePost(filename) {
  const raw = fs.readFileSync(path.join(POSTS_DIR, filename), "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: missing frontmatter block`);
  const [, fmRaw, body] = match;
  const fm = yaml.load(fmRaw);

  const errors = [];
  const expectedSlug = filename.replace(/\.mdx?$/, "");
  if (fm.slug !== expectedSlug) errors.push(`slug "${fm.slug}" must equal filename "${expectedSlug}"`);
  if (!VALID_CATEGORIES.includes(fm.category)) errors.push(`category "${fm.category}" is not one of ${VALID_CATEGORIES.join(", ")}`);
  if (!fm.seoTitle || fm.seoTitle.length > 60) errors.push(`seoTitle must be present and ≤ 60 chars (was ${fm.seoTitle?.length ?? 0})`);
  if (!fm.metaDescription || fm.metaDescription.length < 100 || fm.metaDescription.length > 160) {
    errors.push(`metaDescription should be ~120-155 chars (was ${fm.metaDescription?.length ?? 0})`);
  }
  if (!fm.heroImage?.unsplashId) errors.push("heroImage.unsplashId is required");
  if (!fm.heroImage?.alt) errors.push("heroImage.alt is required");
  if (!Array.isArray(fm.sources) || fm.sources.length < 3) errors.push("sources needs at least 3 entries");
  if (!Array.isArray(fm.faq) || fm.faq.length < 1) errors.push("faq needs at least 1 entry");
  if (errors.length) {
    throw new Error(`${filename}:\n  - ${errors.join("\n  - ")}`);
  }

  // Per HANDOVER.md §4: when frontmatter.disclaimer is set, the article
  // template renders it once as the notice callout — strip the source's
  // own inline blockquote disclaimer first so it doesn't render twice
  // (found live: post 5 has both, and without this the page showed the
  // same disclaimer text in two separate notice boxes).
  let effectiveBody = body;
  if (fm.disclaimer) {
    effectiveBody = effectiveBody.replace(/^(>.*(\n>.*)*\n?)/m, "");
  }

  const { html, toc } = renderMarkdown(effectiveBody);
  const computedWordCount = wordCount(body);
  const computedReadingTime = Math.max(1, Math.round(computedWordCount / 225));
  if (fm.readingTime && Math.abs(fm.readingTime - computedReadingTime) > 1) {
    console.warn(
      `WARN ${filename}: frontmatter readingTime (${fm.readingTime}) differs from computed (${computedReadingTime}) by more than 1 minute`
    );
  }
  if (fm.reviewBy && new Date(fm.reviewBy) < new Date()) {
    console.warn(`WARN ${filename}: reviewBy (${fm.reviewBy}) is in the past — re-check facts before/after publishing`);
  }

  return {
    ...fm,
    categorySlug: CATEGORY_SLUGS[fm.category],
    bodyHtml: html,
    toc,
    wordCount: computedWordCount,
    readingTime: fm.readingTime || computedReadingTime,
  };
}

function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  const posts = files.map(parsePost);

  const slugs = new Set(posts.map((p) => p.slug));
  for (const p of posts) {
    for (const rel of p.relatedPosts || []) {
      if (!slugs.has(rel)) throw new Error(`${p.slug}: relatedPosts references unknown slug "${rel}"`);
    }
  }

  posts.sort((a, b) => (a.datePublished < b.datePublished ? 1 : -1));

  const header = `// AUTO-GENERATED by scripts/build-blog-content.js — do not hand-edit.
// Source of truth is content/posts/*.md. Re-run the script after any
// content change and commit this file alongside it.

export interface BlogSource {
  title: string;
  publisher: string;
  url: string;
}

export interface BlogFaqItem {
  q: string;
  a: string;
}

export interface BlogTocItem {
  id: string;
  text: string;
}

export interface BlogHeroImage {
  unsplashId: string;
  alt: string;
  focal?: string;
}

export interface BlogPost {
  title: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  category: string;
  categorySlug: string;
  tags: string[];
  primaryKeyword: string;
  secondaryKeywords: string[];
  author: string;
  datePublished: string;
  dateModified: string;
  readingTime: number;
  wordCount: number;
  reviewBy?: string;
  heroImage: BlogHeroImage;
  featured: boolean;
  disclaimer?: string;
  relatedPosts: string[];
  sources: BlogSource[];
  faq: BlogFaqItem[];
  bodyHtml: string;
  toc: BlogTocItem[];
}

export const BLOG_POSTS: BlogPost[] = `;

  const output = header + JSON.stringify(posts, null, 2) + ";\n";
  fs.writeFileSync(OUT_FILE, output);
  console.log(`Wrote ${posts.length} posts to ${path.relative(ROOT, OUT_FILE)}`);
}

main();

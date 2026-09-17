/**
 * iCare shared cookie-consent + GA4 loader — 2026-09-17.
 *
 * NOT imported by any Worker route. Same convention as auth-client.js —
 * this repo's whole front-end is self-contained HTML with inline vanilla
 * JS, no build step. This file is the canonical reference; every page
 * copies the block below verbatim into its own <script> tag near the top
 * of <head>. If you change behavior here, update every page that copied
 * it (see PROGRESS.md 2026-09-17 for the current list).
 *
 * Why gated: GA4's gtag.js sets cookies, which under UK GDPR/PECR
 * requires visitor consent before they're set — unlike the site's own
 * signed-in session storage (essential, no consent needed). This uses
 * "basic" consent mode: gtag.js is never even requested from Google
 * until the visitor clicks Accept (or had already accepted on a prior
 * visit, per localStorage) — not "advanced" consent mode, which still
 * sends cookieless pings while denied. No request leaves the browser
 * for Google at all until consent is explicit.
 *
 * Existing gtag()-calling hooks elsewhere (e.g. blog-templates.ts's
 * share_click/outbound_click/etc.) already guard with `if (window.gtag)`,
 * so they silently no-op until consent is granted and this loads GA —
 * no changes needed there.
 */

(function () {
  var GA_ID = "G-00D0TMNYLD";
  var KEY = "icare_analytics_consent"; // "granted" | "denied"

  function loadGA() {
    if (window.__icareGaLoaded) return;
    window.__icareGaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
  }

  var stored;
  try {
    stored = localStorage.getItem(KEY);
  } catch (e) {}

  if (stored === "granted") {
    loadGA();
    return;
  }
  if (stored === "denied") return;

  document.addEventListener("DOMContentLoaded", function () {
    var bar = document.createElement("div");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Cookie consent");
    bar.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#1B1530;color:#fff;" +
      "padding:16px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;" +
      "font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 -2px 12px rgba(0,0,0,.15);";
    bar.innerHTML =
      '<span style="flex:1;min-width:220px;">We use Google Analytics to understand how visitors use this site. ' +
      'No analytics cookies are set unless you accept. <a href="/privacy" style="color:#9DE8DE;">Privacy policy</a></span>' +
      '<span style="display:flex;gap:8px;">' +
      '<button type="button" data-icare-consent="reject" style="background:transparent;border:1px solid #6E58A0;color:#fff;border-radius:999px;padding:8px 16px;font:inherit;cursor:pointer;">Reject</button>' +
      '<button type="button" data-icare-consent="accept" style="background:#00A499;border:0;color:#fff;border-radius:999px;padding:8px 16px;font:inherit;cursor:pointer;font-weight:600;">Accept</button>' +
      "</span>";
    document.body.appendChild(bar);
    bar.addEventListener("click", function (e) {
      var choice = e.target && e.target.getAttribute && e.target.getAttribute("data-icare-consent");
      if (!choice) return;
      try {
        localStorage.setItem(KEY, choice === "accept" ? "granted" : "denied");
      } catch (err) {}
      if (choice === "accept") loadGA();
      bar.remove();
    });
  });
})();

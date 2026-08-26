/**
 * iCare shared client-side auth helper — SPRINTS.md Sprint 0.
 *
 * NOT imported by any Worker route. This repo's whole front-end
 * convention is self-contained HTML with inline vanilla JS, no build
 * step (see landing.html / employers.html) — so this file is the
 * canonical reference, not a module. Every signed-in page copies this
 * block verbatim into its own <script> tag, same way the reveal-on-
 * scroll / share-panel JS is already duplicated identically across
 * landing.html and employers.html rather than imported. If you change
 * behavior here, update every page that copied it.
 *
 * Wraps the session object returned by POST /auth/verify-code
 * (`{ user, session }`, where `session` is a standard Supabase Auth
 * session: access_token, refresh_token, expires_at, ...).
 */

var ICARE_SESSION_KEY = "icare_session";

function icareGetSession() {
  try {
    var raw = localStorage.getItem(ICARE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function icareSetSession(session) {
  try {
    localStorage.setItem(ICARE_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    // Storage unavailable (private browsing, quota) — session just won't persist.
  }
}

function icareClearSession() {
  try {
    localStorage.removeItem(ICARE_SESSION_KEY);
  } catch (e) {}
}

function icareIsSessionExpired(session) {
  if (!session || !session.expires_at) return true;
  // expires_at is a unix timestamp in seconds (Supabase convention).
  return Date.now() >= session.expires_at * 1000;
}

/**
 * Fetch wrapper that attaches the stored access token. Does not refresh
 * expired tokens (no refresh-token exchange route exists yet) — a 401
 * from this should be treated as "session expired, redirect to sign-in".
 */
function icareAuthFetch(url, options) {
  var session = icareGetSession();
  options = options || {};
  var headers = Object.assign({}, options.headers || {});
  if (session && session.access_token) {
    headers["Authorization"] = "Bearer " + session.access_token;
  }
  return fetch(url, Object.assign({}, options, { headers: headers }));
}

/**
 * Call at the top of any signed-in page. Redirects to sign-in
 * (preserving the current path as ?next=) if there's no usable session.
 * Returns the session if present and not expired, so callers don't have
 * to call icareGetSession() again.
 */
function icareRequireAuth(signInPath) {
  var session = icareGetSession();
  if (!session || icareIsSessionExpired(session)) {
    icareClearSession();
    var next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = (signInPath || "/sign-in") + "?next=" + next;
    return null;
  }
  return session;
}

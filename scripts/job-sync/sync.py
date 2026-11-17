#!/usr/bin/env python3
"""Daily job sync for the iCare sponsored-jobs board (HANDOVER.md 27, runbook:
docs/JOB_BOARD_LOADING.md). Run by .github/workflows/job-sync.yml.

  python3 scripts/job-sync/sync.py            # dry run: fetch + parse + print, writes nothing
  SPONSOR_REFRESH_SECRET=... python3 scripts/job-sync/sync.py --apply

For each source in SOURCES it reads the employer's public pages, applies the
agreed rules (health & care roles only; never load an advert that refuses
sponsorship), pushes the jobs through the secret-gated RPC
sync_sponsored_jobs (migration 0063) and closes jobs of that source that were
not seen. Rules this script enforces, so nobody has to remember them:

  * robots.txt is honoured (path checked as written AND lower-cased, so a
    `Disallow: /umbraco` also blocks /Umbraco/...). A source that is blocked or
    returns nothing is reported as FAILED and nothing of it is closed.
  * close_unseen_sponsored_jobs refuses to close if < half of a source's live
    jobs were seen, so a layout change or a block can't wipe the board.
  * No dates on the page -> expires_at is rolled 30 days forward on every run,
    so a job that disappears drops off within 30 days even if closing fails.

Python 3 standard library only. Exit code 1 if any source failed (the Action
goes red and GitHub emails the owner).
"""
import html
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime, timedelta, timezone

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://blflbiwqflidltqflwew.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_Ply3rrROmY-6gNxnppBwvg_eXI-z5pd")
SECRET = os.environ.get("SPONSOR_REFRESH_SECRET")
UA = "iCareJobSync/1.0 (+https://icareltd.com)"
ROLLING_DAYS = 30
BATCH = 10
NOW = datetime.now(timezone.utc)
ROLLING_EXPIRY = (NOW + timedelta(days=ROLLING_DAYS)).strftime("%Y-%m-%dT23:59:59+00")

# A job is skipped when its advert says any of these (sponsorship refused,
# or the advert only asks the question without saying it is offered).
REFUSES = re.compile(
    r"(do(?:es)? not|don'?t|doesn'?t|unable to|cannot|can'?t|not able to|currently not|not currently)\s+(?:\w+\s+){0,3}(?:offer|provide|sponsor|consider)[^.\n]{0,40}sponsor"
    r"|no\s+sponsorship|sponsorship\s+(?:is\s+)?(?:not|unavailable)|UK applications only|not meet the criteria for visa sponsorship"
    r"|do you require sponsorship",
    re.I,
)
STALE = re.compile(r"coronavirus|covid", re.I)


# ---------------------------------------------------------------- http ------
class Http:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.opener.addheaders = [("User-Agent", UA), ("Accept", "text/html,application/json,*/*")]
        self.robots = {}
        self.last = {}

    def _rp(self, url):
        p = urllib.parse.urlsplit(url)
        base = f"{p.scheme}://{p.netloc}"
        if base not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                req = urllib.request.Request(base + "/robots.txt", headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=30) as r:
                    rp.parse(r.read().decode("utf-8-sig", "ignore").splitlines())
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    rp.disallow_all = True
                else:  # 404 etc: no rules
                    rp.parse([])
            except Exception:
                rp.disallow_all = True
            self.robots[base] = rp
        return self.robots[base]

    def allowed(self, url):
        rp = self._rp(url)
        p = urllib.parse.urlsplit(url)
        lower = urllib.parse.urlunsplit((p.scheme, p.netloc, p.path.lower(), p.query, ""))
        return rp.can_fetch(UA, url) and rp.can_fetch(UA, lower)

    def get(self, url, data=None, headers=None):
        if not self.allowed(url):
            raise RuntimeError(f"robots.txt disallows {url}")
        host = urllib.parse.urlsplit(url).netloc
        delay = max(1.0, float(self._rp(url).crawl_delay(UA) or 0))
        wait = self.last.get(host, 0) + delay - time.time()
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, data=data, headers=headers or {})
        try:
            with self.opener.open(req, timeout=40) as r:
                return r.read().decode("utf-8", "ignore")
        finally:
            self.last[host] = time.time()


def text_of(page):
    page = re.sub(r"<(script|style)[\s\S]*?</\1>", "", page)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", re.sub(r"<br\s*/?>|</p>|</li>", "\n", page)))
    return re.sub(r"\n\s*\n+", "\n", re.sub(r"[ \t ]+", " ", t))


def lines_of(page):
    return [x.strip() for x in text_of(page).split("\n") if x.strip()]


def after(lines, label):
    for i, x in enumerate(lines):
        if x.rstrip(":") == label.rstrip(":") and i + 1 < len(lines):
            return lines[i + 1]
    return None


def hourly(t):
    """Hourly rates (GBP) mentioned in text, sane range only."""
    nums = [float(x) for x in re.findall(r"£\s?(\d{2}(?:\.\d{1,2})?)(?!\d)", t)]
    return [n for n in nums if 12 <= n <= 19]


def excerpt(s, n=320):
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + " …"


def iso_date(s, fmt):
    return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")


# ------------------------------------------------------------ renaissance ---
REN_KEEP = re.compile(r"care assistant|care team leader|nurse|home manager|deputy manager|wellbeing lead", re.I)
REN_TOWNS = {"meadowlark": "Forres", "benvie": "Dundee", "jesmond": "Aberdeen", "glencairn": "Edinburgh",
             "riverside": "Aberdeen", "letham": "Edinburgh", "malin": "Girvan", "berelands": "Prestwick",
             "beech": "Blairgowrie", "kingsmills": "Inverness", "cranford": "Aberdeen", "cowdray": "Aberdeen",
             "rosepark": "Uddingston", "whitecraigs": "Glasgow", "persley": "Aberdeen", "wyndwell": "Peterhead",
             "croftbank": "Uddingston", "mathieson": "Edinburgh"}
REN_HOMES = {"benvie": "Benvie Care Home", "letham": "Letham Park Care Home", "malin": "Malin Court Care Home",
             "beech": "Beech Manor Care Home", "persley": "Persley Castle Care Home",
             "croftbank": "Croftbank House Care Home", "cowdray": "Cowdray Club Care Home"}


def source_renaissance(h):
    base = "https://www.renaissance-care.co.uk"
    sm = h.get(base + "/sitemap.xml")
    urls = sorted({u for u in re.findall(r"<loc>([^<]+)</loc>", sm)
                   if re.match(re.escape(base) + r"/career-hub/[a-z0-9-]+/[a-z0-9-]+/$", u)})
    jobs, seen_pages = [], 0
    for u in urls:
        slug_home = u.split("/")[-3]
        page = h.get(u)
        L = lines_of(page)
        try:
            i = L.index("Career Hub")
        except ValueError:
            continue
        title = L[i + 1]
        seen_pages += 1
        if not REN_KEEP.search(title):
            continue
        posted, closes = after(L, "Posted"), after(L, "Closes")
        if not posted or not closes:
            continue
        expires = iso_date(closes, "%B %d, %Y")
        if expires < NOW.strftime("%Y-%m-%d"):
            continue
        body = text_of(page)
        if REFUSES.search(body):
            continue
        loc_i = L.index("Location:") if "Location:" in L else -1
        loc = " ".join(L[loc_i + 1: loc_i + 5]) if loc_i >= 0 else ""
        key = next((k for k in REN_TOWNS if k in (slug_home + " " + loc + " " + title).lower()), None)
        if not key:
            continue  # unknown home: leave for a human (reported below)
        rate = after(L, "Rate") or ""
        pay = hourly(rate)
        desc_lines = [x for x in L[i + 3:] if len(x) > 60 and not x.startswith(("Posted", "Location"))][:2]
        hrs = re.search(r"(\d{2}(?:\.\d+)?)\s*hours?\s*(?:per|a)\s*week", body, re.I)
        contract = (after(L, "Contract") or "").strip() or None
        if "bank" in u.lower():
            contract = "Bank"
        jobs.append({
            "source_job_id": "renaissance-care:career-hub/" + "/".join(u.rstrip("/").split("/")[-2:]),
            "title": re.sub(r"\s+", " ", title).strip(),
            "employer_name": "Renaissance Care (Scotland) Ltd",
            "town": REN_TOWNS[key], "region": (L[loc_i + 1] if loc_i >= 0 else None),
            "location_name": REN_HOMES.get(key, key.title() + " Care Home"),
            "salary_min": min(pay) if pay else None, "salary_max": max(pay) if pay else None,
            "salary_period": "hour" if pay else "year",
            "sector": "Nursing" if "nurse" in title.lower() else "Adult social care",
            "contract_type": contract, "hours": (hrs.group(1) + " hours per week") if hrs and float(hrs.group(1)) >= 20 else None,
            "apply_url": u, "description": excerpt(" ".join(desc_lines)),
            "posted_at": iso_date(posted, "%B %d, %Y"), "expires_at": expires + "T23:59:59+00",
        })
    if seen_pages == 0:
        raise RuntimeError("no job pages parsed")
    return jobs


# ---------------------------------------------------------------- balmoral --
BAL_BASE = "https://careers.balmoralhsc.co.uk/vacancies/"
BAL_REGION = {"prestwick": "Ayrshire", "ayr": "Ayrshire", "castle douglas": "Dumfries & Galloway",
              "dumfries": "Dumfries & Galloway", "stranraer": "Dumfries & Galloway",
              "clydebank": "Glasgow area", "bishopbriggs": "Glasgow area", "bearsden": "Glasgow area",
              "clackmannanshire": "Forth Valley", "stirling": "Forth Valley", "falkirk": "Forth Valley",
              "west lothian": "West Lothian", "winchburgh": "West Lothian", "dundee": "Tayside"}


def source_balmoral(h):
    list_url = BAL_BASE + "vacancy-search-results.aspx"
    page = h.get(list_url)
    ids = re.findall(r"VacancyID=(\d+)", page)
    hidden = lambda p: {m.group(1): html.unescape(m.group(2)) for m in
                        re.finditer(r'<input type="hidden" name="(__[A-Za-z]+)" id="[^"]*" value="([^"]*)"', p)}
    for pager in ("VacancyPager", "VacancyPager2"):
        if "doPostBack(&#39;ctl00$ContentContainer$ctl01$%s&#39;,&#39;2&#39;" % pager in page:
            f = hidden(page)
            f["__EVENTTARGET"] = "ctl00$ContentContainer$ctl01$" + pager
            f["__EVENTARGUMENT"] = "2"
            p2 = h.get(list_url, data=urllib.parse.urlencode(f).encode(),
                       headers={"Content-Type": "application/x-www-form-urlencoded"})
            ids += re.findall(r"VacancyID=(\d+)", p2)
            break
    ids = list(dict.fromkeys(ids))
    if not ids:
        raise RuntimeError("no vacancy ids found")
    jobs = []
    for vid in ids:
        u = f"{BAL_BASE}vacancy-details.aspx?VacancyID={vid}"
        L = lines_of(h.get(u))
        try:
            i = L.index("Call us for any questions")
        except ValueError:
            continue
        title = L[i + 2]
        body = "\n".join(L[i:])
        if REFUSES.search(body) or STALE.search(body):
            continue
        sal = after(L, "Advertising Salary") or ""
        m = re.search(r"£\s?([\d,]+(?:\.\d+)?)\s*(per annum|per hour|an hour|p/h)?", sal)
        smin = float(m.group(1).replace(",", "")) if m else None
        period = "hour" if m and (m.group(2) or "").lower() != "per annum" and smin and smin < 100 else "year"
        suffix = re.split(r"\s+-\s+", title, maxsplit=1)[-1] if " - " in title else None
        loc_line = next((x for x in L[i:i + 14] if x.lower().startswith(("ayrshire", "dumfries", "castle", "bearsden", "stirling",
                                                                        "livingston", "west lothian", "falkirk", "dundee"))), "")
        town = (suffix or loc_line or "Scotland").split("/")[0].split(",")[0].strip()
        town = re.sub(r"\s*\(.*\)$", "", town)
        region = next((r for k, r in BAL_REGION.items() if k in (town + " " + loc_line).lower()), None)
        esteem = "esteem care" in body[:900].lower()
        about = body.split("About The Role", 1)[-1].strip().split("\n")
        jobs.append({
            "source_job_id": f"balmoral:{vid}",
            "title": title,
            "employer_name": "Esteem Care Dumfries and Galloway Ltd" if esteem else "Balmoral Homecare Ltd",
            "town": town, "region": region, "location_name": town,
            "salary_min": smin, "salary_max": smin, "salary_period": period, "sector": "Home care",
            "contract_type": "Bank" if re.search(r"\bbank\b", body[:1500], re.I) else None,
            "apply_url": u, "description": excerpt(next((x for x in about if len(x) > 60), title)),
            "expires_at": ROLLING_EXPIRY,
        })
    return jobs


# ------------------------------------------------------------- right at home -
RAH_BASE = "https://www.rightathome.co.uk"
RAH_OFFICES = {  # office slug -> (exact register name, town, region)
    "the-vale": ("E&G Senior Care Limited T/A Right at Home Bridgend & The Vale of Glamorgan", "Bridgend", "Vale of Glamorgan"),
    "north-somerset": ("Homecare North Somerset Ltd T/A Right at Home North Somerset", "Weston-super-Mare", "Somerset"),
    "tyneside": ("Life and Care Solutions Limited t/a Right at Home Tyneside", "Newcastle upon Tyne", "Tyneside"),
    "nottingham": ("Nottingham Cares Limited T/A Right at Home Nottingham", "Nottingham", "Nottinghamshire"),
    "southtrafford": ("Nullarbor Limited T/A Right at Home South Trafford", "Altrincham", "Greater Manchester"),
    "bedford": ("Overslade care limited T/A Right at Home (Bedford)", "Bedford", "Bedfordshire"),
    "bristol": ("Right at Home Bristol East", "Bristol", "Bristol"),
    "midcheshire": ("Right at Home Mid Cheshire", "Northwich", "Cheshire"),
    "southcheshire": ("Right at Home South Cheshire", "Nantwich", "Cheshire"),
    "stockport": ("Right at Home Stockport & Didsbury", "Stockport", "Greater Manchester"),
    "telford": ("Right at Home Telford t/a Wadlow Care Limited", "Telford", "Shropshire"),
    "worthingshoreham": ("Right At Home Worthing & Shoreham", "Worthing", "West Sussex"),
    "dundee-angus-north-fife": ("Roundstone Quality Care Ltd t/a Right at Home Dundee Angus and North Fife", "Dundee", "Tayside & Fife"),
    "central-london": ("SB QUALITY CARE LTD t/a Right at Home Central London", "London", "London"),
    "ealingandhounslow": ("Sofin Care Limited T/A Right at Home Ealing, Hounslow, Hammersmith and Fulham", "London", "London"),
    "hemelhempstead": ("TSA Homecare Ltd t/a Right at Home Hemel Hempstead", "Hemel Hempstead", "Hertfordshire"),
    "cheshireeast": ("WDR Homecare Ltd t/a Right at Home Cheshire East", "Macclesfield", "Cheshire"),
    # "grantham-newark": deliberately NOT synced — one of its ads says "UK applications only - no sponsorship".
}
RAH_SKIP_TITLE = re.compile(r"loneliness companion|\b20(?:1\d|2[0-5])\b", re.I)


def source_rightathome(h):
    jobs, pages = [], 0
    for slug, (employer, town, region) in RAH_OFFICES.items():
        sm = h.get(f"{RAH_BASE}/{slug}/sitemap.xml")
        for u in sorted(set(re.findall(r"<loc>([^<]+/available-opportunities/[a-z0-9-]+/)</loc>", sm))):
            page = h.get(u)
            L = lines_of(page)
            t = "\n".join(L)
            pages += 1
            m = re.search(r"Careers\n/\n([^\n]+)", t)
            title = m.group(1).strip() if m else None
            if not title or RAH_SKIP_TITLE.search(title) or STALE.search(t) or REFUSES.search(t):
                continue
            pay = hourly(t)
            if re.findall(r"£\s?(\d{1,2}\.\d{2})\s?(?:per hour|/hr|ph|p/h)", t) and any(float(x) < 12 for x in
                    re.findall(r"£\s?(\d{1,2}\.\d{2})\s?(?:per hour|/hr|ph|p/h)", t)):
                continue  # rate below minimum wage: an old page
            suffix = re.split(r"\s+[-–:]\s+", title, maxsplit=1)[-1] if re.search(r"\s[-–:]\s", title) else None
            jtown = suffix if (slug == "cheshireeast" and suffix) else town
            jobs.append({
                "source_job_id": "rightathome:" + slug + "/" + u.rstrip("/").split("/")[-1],
                "title": title, "employer_name": employer, "town": jtown, "region": region,
                "location_name": suffix if suffix and len(suffix) < 60 else None,
                "salary_min": min(pay) if pay else None, "salary_max": max(pay) if pay else None,
                "salary_period": "hour" if pay else "year", "sector": "Home care",
                "apply_url": u,
                "description": f"{title} with {re.sub(r'^.*?(Right at Home)', r'Right at Home', employer, flags=re.I)}. "
                               "An evergreen recruitment page on the office's website; check the advert for current availability, pay and hours.",
                "expires_at": ROLLING_EXPIRY,
            })
    if pages == 0:
        raise RuntimeError("no job pages found")
    return jobs


SOURCES = [
    ("renaissance-care:", "Renaissance Care", source_renaissance),
    ("balmoral:", "Balmoral Homecare", source_balmoral),
    ("rightathome:", "Right at Home (17 offices)", source_rightathome),
]


# ------------------------------------------------------------------ rpc -----
def rpc(fn, args):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/{fn}", data=json.dumps(args).encode(), method="POST",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{fn} failed ({e.code}): {e.read().decode('utf-8', 'ignore')[:300]}")


def main():
    apply = "--apply" in sys.argv
    if apply and not SECRET:
        sys.exit("SPONSOR_REFRESH_SECRET is not set")
    h = Http()
    report, failed = [], False
    for prefix, name, fn in SOURCES:
        row = {"source": name, "found": 0, "new": 0, "updated": 0, "open": 0, "hidden": 0, "closed": 0, "status": "ok"}
        try:
            jobs = fn(h)
            ids = [j["source_job_id"] for j in jobs]
            if len(ids) != len(set(ids)):
                raise RuntimeError("duplicate job ids")
            jobs = [{k: v for k, v in j.items() if v is not None} for j in jobs]
            row["found"] = len(jobs)
            if not jobs:
                raise RuntimeError("0 jobs found")
            if apply:
                for i in range(0, len(jobs), BATCH):
                    r = rpc("sync_sponsored_jobs", {"p_secret": SECRET, "p_jobs": jobs[i:i + BATCH]})
                    for k in ("new", "updated", "open", "hidden"):
                        row[k] += r[k]
                c = rpc("close_unseen_sponsored_jobs", {"p_secret": SECRET, "p_prefix": prefix, "p_seen": ids})
                row["closed"] = c["closed"]
            else:
                os.makedirs("job-sync-out", exist_ok=True)
                with open(f"job-sync-out/{prefix.rstrip(':')}.json", "w") as f:
                    json.dump(jobs, f, indent=1, ensure_ascii=False)
        except Exception as e:  # one failing source must not stop the others
            row["status"] = f"FAILED: {e}"
            failed = True
        report.append(row)
        print(row, flush=True)

    lines = ["| Source | Found | New | Updated | Open | Hidden | Closed | Status |", "|---|---|---|---|---|---|---|---|"]
    for r in report:
        lines.append(f"| {r['source']} | {r['found']} | {r['new']} | {r['updated']} | {r['open']} | {r['hidden']} | {r['closed']} | {r['status']} |")
    summary = "\n".join(["### Job sync" + ("" if apply else " (dry run — nothing written)")] + lines)
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(summary + "\n")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

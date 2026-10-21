"""Fetch the cycling corpus from Wikipedia into a local cache.

Separated from chunking on purpose. Chunking gets re-run constantly while the
rules are tuned, and re-downloading 300 articles each time would be slow, rude
to Wikipedia, and would quietly change the corpus underneath the regression
suite whenever an article was edited. So this writes a dated snapshot to
scripts/wikipedia_cache/ and the chunker reads only from there.

Usage:
    python3 scripts/fetch_wikipedia_cycling.py            # fetch / refresh cache
    python3 scripts/fetch_wikipedia_cycling.py --list     # show what is cached

Text is CC BY-SA 4.0. Attribution ships on the page; see InteractiveRag.js.
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CACHE = Path(__file__).parent / "wikipedia_cache"
API = "https://en.wikipedia.org/w/api.php?"

# Wikipedia returns 403 to clients that do not identify themselves. This is
# their documented policy, not rate limiting, and a descriptive UA with contact
# details is what the API terms of use ask for.
UA = {
    "User-Agent": "gillesvandevyver.com-ragindex/1.0 "
                  "(https://gillesvandevyver.com; gillesvandevyver1@gmail.com)"
}

# Categories that actually exist and hold articles. Several plausible names
# ("Category:Bicycle types", "Category:Bicycle racing") are redirects or
# container categories holding only subcategories, and return nothing.
CATEGORIES = [
    "Category:Cycling",
    "Category:Bicycles",
    "Category:Bicycle parts",
    "Category:Cycle sport",
    "Category:Cycling infrastructure",
    "Category:Cycling safety",
    "Category:Utility cycling",
    "Category:Mountain biking",
]

# Articles worth having whether or not a category happens to list them. These
# are the technical ones: they carry the explanatory prose that makes retrieval
# worth doing at all, as opposed to the many short articles about individual
# races and riders.
SEED_TITLES = [
    "Bicycle",
    "Bicycle and motorcycle dynamics",
    "Bicycle and motorcycle geometry",
    "Bicycle performance",
    "Bicycle frame",
    "Bicycle wheel",
    "Bicycle brake",
    "Bicycle gearing",
    "Bicycle drivetrain systems",
    "Derailleur",
    "Derailleur gears",
    "Hub gear",
    "Bicycle chain",
    "Bicycle pedal",
    "Bicycle saddle",
    "Bicycle handlebar",
    "Bicycle fork",
    "Bicycle suspension",
    "Bicycle tire",
    "Bicycle lighting",
    "Bicycle helmet",
    "Bicycle lock",
    "Bicycle commuting",
    "Bicycle touring",
    "Bicycle safety",
    "Cycling infrastructure",
    "Segregated cycle facilities",
    "Bicycle-friendly",
    "Road bicycle",
    "Mountain bike",
    "Touring bicycle",
    "Gravel bicycle",
    "Cyclo-cross bicycle",
    "Track bicycle",
    "Folding bicycle",
    "Recumbent bicycle",
    "Cargo bicycle",
    "Electric bicycle",
    "Fixed-gear bicycle",
    "Single-speed bicycle",
    "Tandem bicycle",
    "History of the bicycle",
    "Countersteering",
    "Cadence (cycling)",
    "Cycling power meter",
    "Gear inverches",
    "Rolling resistance",
    "Drag (physics)",
    "Steel frame bicycle",
    "Bicycle maintenance",
]

# Stubs and disambiguation pages add proper nouns and no explanation, which is
# exactly the material that poisoned BM25 in the previous corpus.
MIN_CHARS = 2000


def api(**params):
    params.setdefault("format", "json")
    params.setdefault("action", "query")
    url = API + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers=UA)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                return json.loads(response.read())
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt == 3:
                raise
            # Back off rather than hammer: a transient 429 or reset should not
            # abort a 300-article fetch most of the way through.
            print(f"    retry {attempt + 1} after {exc}", file=sys.stderr)
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def collect_titles():
    """Union of the category listings and the seed list."""
    titles = set(SEED_TITLES)
    for category in CATEGORIES:
        payload = api(list="categorymembers", cmtitle=category,
                      cmlimit=500, cmtype="page")
        members = payload.get("query", {}).get("categorymembers", [])
        print(f"  {len(members):4d} from {category}")
        titles.update(m["title"] for m in members)
        time.sleep(0.15)
    return sorted(titles)


def fetch_extracts(titles):
    """Plain-text extracts, 20 titles per request.

    explaintext gives prose with the infoboxes, navboxes, reference markers and
    image captions already removed, which is most of the furniture problem the
    PDF pipeline had to solve with regexes.
    """
    # One title per request. Batching looks tempting and does not work: for
    # whole-article extracts the API caps exlimit at 1 and says so only in a
    # warning ("exlimit was too large ... lowered to 1"), so a 20-title request
    # returns one article and nineteen empty extracts, which looks like a
    # corpus of 17 articles rather than an error.
    out = {}
    for i, title in enumerate(titles, 1):
        payload = api(prop="extracts", explaintext=1, redirects=1, titles=title)
        for page in payload.get("query", {}).get("pages", {}).values():
            extract = page.get("extract")
            if extract:
                out[page["title"]] = extract
        if i % 25 == 0 or i == len(titles):
            print(f"  fetched {i}/{len(titles)}  (have {len(out)})")
        time.sleep(0.12)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()

    if args.list:
        for path in sorted(CACHE.glob("*.json")):
            data = json.loads(path.read_text())
            print(f"{len(data['articles']):4d} articles  {path.name}")
        return

    CACHE.mkdir(exist_ok=True)
    print("Collecting titles ...")
    titles = collect_titles()
    print(f"  {len(titles)} unique titles\n")

    print("Fetching extracts ...")
    extracts = fetch_extracts(titles)
    print()

    kept = {t: x for t, x in extracts.items() if len(x) >= MIN_CHARS}
    dropped = len(extracts) - len(kept)
    total = sum(len(x) for x in kept.values())

    snapshot = {
        "source": "en.wikipedia.org",
        "license": "CC BY-SA 4.0",
        "fetched": time.strftime("%Y-%m-%d"),
        "articles": [
            {
                "title": title,
                "url": "https://en.wikipedia.org/wiki/"
                       + urllib.parse.quote(title.replace(" ", "_")),
                "text": text,
            }
            for title, text in sorted(kept.items())
        ],
    }
    path = CACHE / "cycling.json"
    path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1))

    print(f"  kept {len(kept)} articles ({dropped} below {MIN_CHARS} chars dropped)")
    print(f"  {total / 1000:.0f} kB of prose -> {path}")


if __name__ == "__main__":
    main()

/* Runs the real yodelr.py in the browser under Pyodide.
 *
 * The point of the playground is that it executes the actual submitted
 * implementation, not a JavaScript lookalike that agrees with it today and
 * quietly stops agreeing later. So yodelr.py is fetched as a file, dropped on
 * Pyodide's virtual filesystem and imported. Nothing in this repo reimplements
 * it and nothing here edits it.
 *
 * Everything below the BRIDGE constant is glue of mine that imports yodelr and
 * calls it from the outside, the same way the unit tests do.
 */

// Pinned rather than "latest": the page should not change behaviour because a
// CDN moved on. 0.27.x ships CPython 3.12, comfortably above the 3.6 floor the
// challenge sets.
const PYODIDE_VERSION = '0.27.8';
const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const SRC_URL = `${process.env.PUBLIC_URL}/yodelr/yodelr.py`;
const PROVENANCE_URL = `${process.env.PUBLIC_URL}/yodelr/provenance.json`;

// The real-tweet corpus. ~1.9 MB, so it is fetched only if someone opens the
// tab that uses it, not as part of booting the page.
const CORPUS_URL = `${process.env.PUBLIC_URL}/yodelr/corpus.tsv.gz`;
const CORPUS_META_URL = `${process.env.PUBLIC_URL}/yodelr/corpus.json`;

// How many rows the state panel asks for. The corpus holds 25k users and 36k
// posts; serialising all of that into JSON on every call would cost more than
// the calls being measured, and no one reads a list that long anyway. The
// panel shows the totals in full and says what it is truncating.
const PANEL_LIMIT = 200;

/* Python-side glue. It imports YodelrImpl and calls it; it does not reach into
 * the implementation to change anything.
 *
 * Two jobs that are worth doing in Python rather than JavaScript:
 *
 *  - Timing. perf_counter() wrapped around the bare method call measures the
 *    implementation, leaving out JSON encoding and the JS/Python bridge. Those
 *    would otherwise dwarf an O(log n) lookup and make every operation look
 *    identically slow, which is the opposite of what the page is for.
 *
 *  - Bulk loading. A few hundred posts crossing the bridge one at a time costs
 *    far more in call overhead than the adds themselves.
 */
const BRIDGE = `
import gzip, json, time
from yodelr import YodelrImpl, Yodelr, MAX_POST_LENGTH, _TOPIC_RE


def _unescape(field):
    """Undo the escaping build_yodelr_corpus.py applies to a TSV field.

    Left to right in one pass rather than three .replace() calls, because a
    tweet containing a literal backslash-n would otherwise come back as a real
    newline on the second pass.
    """
    if "\\\\" not in field:
        return field
    out = []
    i = 0
    n = len(field)
    while i < n:
        c = field[i]
        if c == "\\\\" and i + 1 < n:
            nxt = field[i + 1]
            out.append({"t": "\\t", "n": "\\n", "r": "\\r"}.get(nxt, nxt))
            i += 2
        else:
            out.append(c)
            i += 1
    return "".join(out)

class Bridge:
    """Owns one YodelrImpl and calls it on behalf of the page."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.y = YodelrImpl()

    # -- calling the implementation ------------------------------------

    def call(self, method, args_json):
        """Invoke one API method. Never raises: the error is the result.

        ValueError is not a failure of the page, it is a documented part of
        the implementation's behaviour, so it is reported as data and shown
        rather than thrown away.
        """
        args = json.loads(args_json)
        fn = getattr(self.y, method)

        start = time.perf_counter()
        try:
            value = fn(*args)
        except Exception as err:          # noqa: BLE001 - reporting, not handling
            elapsed = (time.perf_counter() - start) * 1000.0
            return json.dumps({
                "ok": False,
                "ms": elapsed,
                "errorType": type(err).__name__,
                "error": str(err),
            })
        elapsed = (time.perf_counter() - start) * 1000.0
        return json.dumps({"ok": True, "ms": elapsed, "value": value})

    def load_corpus(self, path):
        """Replay a gzipped TSV corpus of real tweets through the implementation.

        Parsing and replaying are timed separately. Lumping them together would
        charge add_post for gzip and string splitting, which is most of the
        wall clock and none of the thing being demonstrated.
        """
        t0 = time.perf_counter()

        seen = set()
        users = []
        posts = []
        with gzip.open(path, "rt", encoding="utf-8", newline="") as fh:
            for line in fh:
                if not line.strip():
                    continue
                name, ts, text = line.rstrip("\\n").split("\\t", 2)
                name = _unescape(name)
                if name not in seen:
                    seen.add(name)
                    users.append(name)
                posts.append((name, _unescape(text), int(ts)))

        t1 = time.perf_counter()
        try:
            for name in users:
                self.y.add_user(name)
            t2 = time.perf_counter()
            for name, text, ts in posts:
                self.y.add_post(name, text, ts)
            t3 = time.perf_counter()
        except Exception as err:          # noqa: BLE001
            return json.dumps({
                "ok": False,
                "errorType": type(err).__name__,
                "error": str(err),
            })

        return json.dumps({
            "ok": True,
            "users": len(users),
            "posts": len(posts),
            "parseMs": (t1 - t0) * 1000.0,
            "addUserMs": (t2 - t1) * 1000.0,
            "addPostMs": (t3 - t2) * 1000.0,
            "perPostUs": (t3 - t2) * 1e6 / max(len(posts), 1),
        })

    # -- looking at the state ------------------------------------------

    def snapshot(self, limit=0):
        """Read the three indexes for the state panel.

        This reads private attributes on purpose. They are the interesting
        part: the design note in yodelr.py explains that a post is filed in
        three structures at once, and the panel shows all three holding the
        same posts.
        """
        y = self.y

        # Busiest first in both lists. With a handful of hand-entered users the
        # order hardly matters; with 25,000 of them from the tweet corpus, the
        # busiest are the only ones worth a row, and they are also the ones
        # that make delete_user expensive.
        users = sorted(
            ({"name": name, "postCount": len(posts)}
             for name, posts in y._posts_by_user.items()),
            key=lambda u: (-u["postCount"], u["name"]),
        )

        topics = sorted(
            ({"name": topic, "postCount": len(bucket)}
             for topic, bucket in y._posts_by_topic.items()),
            key=lambda t: (-t["postCount"], t["name"]),
        )

        n_users, n_topics, n_posts = len(users), len(topics), len(y._timeline)

        # The tail, not the head: after adding a post you want to see it, and
        # with the tweet corpus the first 200 of 2009 are no more interesting
        # than any other 200. Still in the implementation's own ascending
        # order, because "the timeline is kept sorted" is the thing on show.
        recent = y._timeline[-limit:] if limit else y._timeline
        timeline = [
            {
                "ts": p.timestamp,
                "user": p.user_name,
                "text": p.text,
                "topics": sorted(p.topics),
            }
            for p in recent
        ]

        if limit:
            users = users[:limit]
            topics = topics[:limit]

        return json.dumps({
            "users": users,
            "topics": topics,
            "timeline": timeline,
            "truncated": bool(limit) and (
                n_users > limit or n_topics > limit or n_posts > limit
            ),
            "shown": limit or 0,
            "totals": {
                "users": n_users,
                "posts": n_posts,
                "topics": n_topics,
            },
            # Drives the "last + 1" default in the post form. None before the
            # first post. Note it survives delete_user, which is why the page
            # can offer a timestamp that the implementation will still reject.
            "lastTimestamp": y._last_timestamp,
            # The real extent of the timeline, which the truncated list above
            # cannot be read off once there are more posts than it shows.
            "firstTimestamp": y._timeline[0].timestamp if y._timeline else None,
            "latestTimestamp": y._timeline[-1].timestamp if y._timeline else None,
        })

    # -- things the page needs to agree with the implementation on -----

    def constants(self):
        """Take the character limit and the topic pattern from the source.

        The live counter and the typing highlighter have to agree with the
        implementation about what counts as a topic and where 140 falls. If the
        page hard-coded either, editing yodelr.py would silently put the two out
        of step, which is the exact failure this whole setup exists to avoid.
        """
        return json.dumps({
            "maxPostLength": MAX_POST_LENGTH,
            "topicPattern": _TOPIC_RE.pattern,
        })

    def interface_check(self):
        """Confirm the loaded file really is the submitted interface."""
        return json.dumps({
            "isYodelr": issubclass(YodelrImpl, Yodelr),
            "abstractMethods": sorted(Yodelr.__abstractmethods__),
        })

_bridge = Bridge()
`;

/** Load a classic script once and resolve when it has run. */
function injectScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-yodelr-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve();
      else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Pyodide failed to load')));
      }
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.yodelrSrc = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error(
      'Could not reach the Pyodide CDN. The playground needs it to run Python.',
    )));
    document.head.appendChild(script);
  });
}

async function fetchText(url, what) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${what} (HTTP ${response.status}).`);
  return response.text();
}

async function fetchBytes(url, what) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${what} (HTTP ${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

/* One runtime per page load, shared across mounts. Booting Pyodide costs
 * seconds and a few MB, so navigating away and back reuses it rather than
 * paying again. */
let runtimePromise = null;

async function boot(onProgress) {
  const report = (message) => { if (onProgress) onProgress(message); };

  report('Fetching the Python runtime…');
  await injectScript(`${PYODIDE_INDEX}pyodide.js`);

  report('Starting Python…');
  const pyodide = await window.loadPyodide({
    indexURL: PYODIDE_INDEX,
    // Keep the console clean; the implementation prints nothing anyway.
    stdout: () => {},
    stderr: () => {},
  });

  report('Loading yodelr.py…');
  const [source, provenanceText, corpusMetaText] = await Promise.all([
    fetchText(SRC_URL, 'yodelr.py'),
    fetchText(PROVENANCE_URL, 'the yodelr.py provenance record').catch(() => '{}'),
    // Half a kilobyte of counts, so the load button can say how many tweets
    // and how many megabytes before anyone commits to the 1.9 MB of them.
    fetchText(CORPUS_META_URL, 'the corpus description').catch(() => '{}'),
  ]);

  // Its own directory on the virtual filesystem, so the import is a plain
  // `from yodelr import ...` exactly as in the test suite.
  pyodide.FS.mkdirTree('/yodelr_src');
  pyodide.FS.writeFile('/yodelr_src/yodelr.py', source);
  pyodide.runPython('import sys\nif "/yodelr_src" not in sys.path: sys.path.insert(0, "/yodelr_src")');

  report('Importing YodelrImpl…');
  pyodide.runPython(BRIDGE);

  const bridge = pyodide.globals.get('_bridge');
  const constants = JSON.parse(bridge.constants());
  const interfaceCheck = JSON.parse(bridge.interface_check());

  if (!interfaceCheck.isYodelr) {
    throw new Error('The loaded yodelr.py does not implement the Yodelr interface.');
  }

  const pythonVersion = pyodide.runPython('import sys; sys.version.split()[0]');

  // The corpus file is only pulled across the network once per page load, even
  // if it is loaded, reset and loaded again. Pyodide's filesystem keeps it.
  let corpusOnDisk = false;

  return {
    /** Call one of the six API methods. Resolves with the error, never rejects. */
    call(method, args) {
      return JSON.parse(bridge.call(method, JSON.stringify(args)));
    },
    /** Replay the real-tweet corpus. Downloads it the first time. */
    async loadCorpus(onProgress) {
      const report = (message) => { if (onProgress) onProgress(message); };
      if (!corpusOnDisk) {
        report('Downloading the tweet corpus…');
        const bytes = await fetchBytes(CORPUS_URL, 'the tweet corpus');
        pyodide.FS.mkdirTree('/yodelr_data');
        pyodide.FS.writeFile('/yodelr_data/corpus.tsv.gz', bytes);
        corpusOnDisk = true;
      }
      report('Replaying it through yodelr.py…');
      // load_corpus blocks the main thread for a second or two. Yield first so
      // the browser paints that message rather than showing it after the work
      // it was meant to describe has already finished.
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      return JSON.parse(bridge.load_corpus('/yodelr_data/corpus.tsv.gz'));
    },
    snapshot() {
      return JSON.parse(bridge.snapshot(PANEL_LIMIT));
    },
    reset() {
      bridge.reset();
    },
    source,
    constants,
    abstractMethods: interfaceCheck.abstractMethods,
    provenance: JSON.parse(provenanceText),
    corpusMeta: JSON.parse(corpusMetaText),
    pythonVersion,
    pyodideVersion: PYODIDE_VERSION,
  };
}

export function loadRuntime(onProgress) {
  if (!runtimePromise) {
    runtimePromise = boot(onProgress).catch((err) => {
      // Let a later mount retry rather than caching the failure forever.
      runtimePromise = null;
      throw err;
    });
  } else if (onProgress) {
    onProgress('Starting Python…');
  }
  return runtimePromise;
}

export { PYODIDE_VERSION };

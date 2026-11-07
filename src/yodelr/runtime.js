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
import json, time
from yodelr import YodelrImpl, Yodelr, MAX_POST_LENGTH, _TOPIC_RE

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

    def bulk_add(self, payload_json):
        """Load many users and posts, timing the adds and nothing else."""
        payload = json.loads(payload_json)

        start = time.perf_counter()
        try:
            for name in payload["users"]:
                self.y.add_user(name)
            for user, text, ts in payload["posts"]:
                self.y.add_post(user, text, ts)
        except Exception as err:          # noqa: BLE001
            elapsed = (time.perf_counter() - start) * 1000.0
            return json.dumps({
                "ok": False,
                "ms": elapsed,
                "errorType": type(err).__name__,
                "error": str(err),
            })
        elapsed = (time.perf_counter() - start) * 1000.0
        return json.dumps({
            "ok": True,
            "ms": elapsed,
            "value": None,
            "count": len(payload["posts"]) + len(payload["users"]),
        })

    # -- looking at the state ------------------------------------------

    def snapshot(self):
        """Read the three indexes for the state panel.

        This reads private attributes on purpose. They are the interesting
        part: the design note in yodelr.py explains that a post is filed in
        three structures at once, and the panel shows all three holding the
        same posts.
        """
        y = self.y

        users = sorted(
            ({"name": name, "postCount": len(posts)}
             for name, posts in y._posts_by_user.items()),
            key=lambda u: u["name"],
        )

        topics = sorted(
            ({"name": topic, "postCount": len(bucket)}
             for topic, bucket in y._posts_by_topic.items()),
            key=lambda t: (-t["postCount"], t["name"]),
        )

        timeline = [
            {
                "ts": p.timestamp,
                "user": p.user_name,
                "text": p.text,
                "topics": sorted(p.topics),
            }
            for p in y._timeline
        ]

        return json.dumps({
            "users": users,
            "topics": topics,
            "timeline": timeline,
            "totals": {
                "users": len(users),
                "posts": len(y._timeline),
                "topics": len(topics),
            },
            # Drives the "last + 1" default in the post form. None before the
            # first post. Note it survives delete_user, which is why the page
            # can offer a timestamp that the implementation will still reject.
            "lastTimestamp": y._last_timestamp,
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
  const [source, provenanceText] = await Promise.all([
    fetchText(SRC_URL, 'yodelr.py'),
    fetchText(PROVENANCE_URL, 'the yodelr.py provenance record').catch(() => '{}'),
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

  return {
    /** Call one of the six API methods. Resolves with the error, never rejects. */
    call(method, args) {
      return JSON.parse(bridge.call(method, JSON.stringify(args)));
    },
    bulkAdd(users, posts) {
      return JSON.parse(bridge.bulk_add(JSON.stringify({ users, posts })));
    },
    snapshot() {
      return JSON.parse(bridge.snapshot());
    },
    reset() {
      bridge.reset();
    },
    source,
    constants,
    abstractMethods: interfaceCheck.abstractMethods,
    provenance: JSON.parse(provenanceText),
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

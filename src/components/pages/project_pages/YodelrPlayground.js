import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './CommonStyles.css';
import './YodelrPlayground.css';
import { loadRuntime } from '../../../yodelr/runtime';
import { WALKTHROUGH } from '../../../yodelr/sampleData';
import BenchmarkPanel from '../../../yodelr/BenchmarkPanel';

/* The Yodelr page.
 *
 * Every button here calls the real yodelr.py, running under Pyodide. There is
 * no JavaScript reimplementation anywhere in this file: when a call returns a
 * list, Python sorted it, and when it raises, Python raised.
 *
 * Three tabs, one Yodelr instance behind all of them. The tabs differ only in
 * what gets loaded into it: nothing, or 35,813 real tweets. Switching tabs is
 * deliberately not a reset — the state panel is always the honest answer to
 * "what is in there right now", and silently emptying it on a tab click would
 * make that panel a liar.
 */

const TABS = [
  ['manual', 'By hand'],
  ['corpus', 'Real tweets'],
  ['timing', 'Timing'],
];

/* The same six cards on both tabs — same component, same handlers, same state.
 * Only the order changes, because the two tabs are read in opposite directions.
 * By hand you start with an empty object, so add_user has to come first or
 * there is nothing to query. With the tweet corpus the object arrives already
 * full and the queries are the whole point, so the three mutators move to the
 * bottom: they are what you reach for afterwards, to watch delete_user pay for
 * rebuilding a 35,813-post timeline. */
const QUERIES = ['get_posts_for_user', 'get_posts_for_topic', 'get_trending_topics'];
const MUTATORS = ['add_user', 'add_post', 'delete_user'];
const CARD_ORDER = {
  manual: [...MUTATORS, ...QUERIES],
  corpus: [...QUERIES, ...MUTATORS],
};

/** 1,234,567 rather than 1234567, for the corpus counts. */
function thousands(n) {
  return typeof n === 'number' ? n.toLocaleString('en-US') : '—';
}

/** Sub-millisecond calls are the normal case, so keep the small digits. */
function formatMs(ms) {
  if (ms < 1) return `${ms.toFixed(3)} ms`;
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  return `${ms.toFixed(1)} ms`;
}

/* Python's len() counts code points; JavaScript's .length counts UTF-16 units
 * and so reports 2 for an emoji. The counter has to agree with the limit the
 * implementation actually enforces, so count the way Python does. */
function codePointLength(text) {
  return Array.from(text).length;
}

/** Split text into topic and non-topic runs, using the implementation's own regex. */
function splitTopics(text, pattern) {
  if (!pattern) return [{ text, topic: null }];
  const re = new RegExp(pattern, 'g');
  const runs = [];
  let cursor = 0;
  let match = re.exec(text);
  while (match !== null) {
    if (match.index > cursor) runs.push({ text: text.slice(cursor, match.index), topic: null });
    runs.push({ text: match[0], topic: match[1] });
    cursor = match.index + match[0].length;
    match = re.exec(text);
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), topic: null });
  return runs;
}

/* ── Result rendering ──────────────────────────────────────────────── */

/* The result of one call.
 *
 * Rendered inside a slot that is always in the document (see MethodCard): a
 * live region only announces changes to itself, so one that appears at the
 * same moment as the first result announces nothing at all. */
function CallResult({ result, emptyNote }) {
  if (!result) return null;

  if (!result.ok) {
    return (
      <div className="yo-result yo-result-error">
        <span className="yo-result-label">
          {result.errorType} <span className="yo-timing">· {formatMs(result.ms)}</span>
        </span>
        <p className="yo-error-message">{result.error}</p>
      </div>
    );
  }

  const value = result.value;

  // add_user, add_post and delete_user all return None. Saying so is more
  // honest than showing a bare tick, since None is what Python handed back.
  if (value === null || value === undefined) {
    return (
      <div className="yo-result yo-result-ok">
        <span className="yo-result-label">
          returned <code>None</code>
          <span className="yo-timing"> · {formatMs(result.ms)}</span>
        </span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div className="yo-result yo-result-ok">
        <span className="yo-result-label">
          {value.length} {value.length === 1 ? 'item' : 'items'}
          <span className="yo-timing"> · {formatMs(result.ms)}</span>
        </span>
        {value.length === 0
          ? <p className="yo-empty-note">{emptyNote || 'Empty list.'}</p>
          : (
            <ol className="yo-result-list">
              {value.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}
            </ol>
          )}
      </div>
    );
  }

  return (
    <div className="yo-result yo-result-ok">
      <span className="yo-result-label">{String(value)}</span>
    </div>
  );
}

/** One API method: signature, note, its own controls, its own last result. */
function MethodCard({ name, signature, note, children, result, emptyNote, onSubmit, busy }) {
  return (
    <section className="yo-method" aria-labelledby={`method-${name}`}>
      <h3 className="yo-method-head" id={`method-${name}`}>
        <code>{signature}</code>
      </h3>
      <p className="yo-method-note">{note}</p>
      <form
        className="yo-method-form"
        onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
      >
        {children}
      </form>
      {/* Always present, even while empty, so that it is an established live
          region by the time a result lands in it. Assertive because the reader
          asked for this answer and is waiting on it. */}
      <div className="yo-result-slot" aria-live="assertive" aria-atomic="true">
        <CallResult result={result} emptyNote={emptyNote} />
      </div>
    </section>
  );
}

/* ── The page ──────────────────────────────────────────────────────── */

const YodelrPlayground = () => {
  const runtimeRef = useRef(null);

  const [status, setStatus] = useState({ state: 'loading', message: 'Starting…' });
  const [info, setInfo] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('manual');
  const [statePane, setStatePane] = useState('topics');
  /* What the corpus load reported back: counts and the time the replay took.
   * null until someone asks for it, since it is a 1.9 MB download. */
  const [corpusRun, setCorpusRun] = useState(null);
  const [corpusStatus, setCorpusStatus] = useState(null);
  /* Loading a scenario or resetting changes the whole system at once, and the
   * only evidence is the state panel quietly redrawing. Sighted readers see
   * that; everyone else gets this line. */
  const [announcement, setAnnouncement] = useState('');

  // Per-method form state and per-method last result.
  const [fields, setFields] = useState({
    addUser: '',
    postUser: '',
    postText: '',
    postTs: '1',
    deleteUser: '',
    postsUser: '',
    postsTopic: '',
    trendFrom: '1',
    trendTo: '3',
  });
  const [results, setResults] = useState({});
  // While false, the timestamp box tracks "last + 1" on its own.
  const [tsOverridden, setTsOverridden] = useState(false);

  const setField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    document.title = 'Yodelr · gillesvandevyver.com';
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadRuntime((message) => {
      if (!cancelled) setStatus({ state: 'loading', message });
    })
      .then((runtime) => {
        if (cancelled) return;
        runtimeRef.current = runtime;
        // Shared across mounts, so it may already hold state from a previous
        // visit to this page. Start from a clean system either way.
        runtime.reset();
        setInfo({
          provenance: runtime.provenance,
          corpusMeta: runtime.corpusMeta,
          constants: runtime.constants,
          pythonVersion: runtime.pythonVersion,
          pyodideVersion: runtime.pyodideVersion,
          abstractMethods: runtime.abstractMethods,
        });
        setSnapshot(runtime.snapshot());
        setStatus({ state: 'ready', message: '' });
      })
      .catch((error) => {
        if (!cancelled) setStatus({ state: 'error', message: error.message });
      });

    return () => { cancelled = true; };
  }, []);

  const maxLength = info?.constants?.maxPostLength ?? 140;
  const topicPattern = info?.constants?.topicPattern;
  const ready = status.state === 'ready';

  /* Every call goes through here: run it, then refresh the state panel. */
  const run = useCallback((method, args) => {
    const runtime = runtimeRef.current;
    if (!runtime) return null;

    setBusy(true);
    try {
      const result = runtime.call(method, args);
      setResults((prev) => ({ ...prev, [method]: result }));
      setSnapshot(runtime.snapshot());
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  /* Keep the timestamp box on "last + 1" until the reader takes it over. */
  const nextTimestamp = snapshot?.lastTimestamp == null ? 1 : snapshot.lastTimestamp + 1;
  useEffect(() => {
    if (!tsOverridden) setField('postTs', String(nextTimestamp));
  }, [nextTimestamp, tsOverridden]);

  /* ── Bulk actions ──────────────────────────────────────────────── */

  /** Announce what a bulk load or a reset did, since the only other evidence
   *  is the state panel quietly redrawing. */
  const announceState = useCallback((runtime, prefix) => {
    const next = runtime.snapshot();
    setSnapshot(next);
    setAnnouncement(
      `${prefix}. ${next.totals.users} users, ${next.totals.posts} posts, `
      + `${next.totals.topics} topics.`,
    );
    return next;
  }, []);

  const loadWalkthrough = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setBusy(true);
    try {
      runtime.reset();
      runtime.bulkAdd(WALKTHROUGH.users, WALKTHROUGH.posts);
      setResults({});
      setCorpusRun(null);
      setTsOverridden(false);
      announceState(runtime, 'Loaded the spec example');
      setFields((prev) => ({
        ...prev,
        postUser: 'john',
        deleteUser: 'john',
        postsUser: 'john',
        postsTopic: 'steak',
        trendFrom: '1',
        trendTo: '3',
      }));
    } finally {
      setBusy(false);
    }
  }, [announceState]);

  /* The tweet corpus. Async because the file has to arrive first; everything
   * after that is one blocking call into Python. */
  const loadCorpus = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setBusy(true);
    setCorpusStatus('Downloading the tweet corpus…');
    try {
      runtime.reset();
      const result = await runtime.loadCorpus(setCorpusStatus);
      setResults({});
      setTsOverridden(false);
      if (!result.ok) {
        setCorpusStatus(`${result.errorType}: ${result.error}`);
        return;
      }
      setCorpusRun(result);
      setCorpusStatus(null);
      const next = announceState(runtime, 'Loaded the tweet corpus');
      const busiest = next.users[0]?.name ?? '';
      const hottest = next.topics[0]?.name ?? '';
      setFields((prev) => ({
        ...prev,
        postUser: busiest,
        deleteUser: busiest,
        postsUser: busiest,
        postsTopic: hottest,
        // One day out of the 79 the corpus spans. A window that covers
        // everything would make trending look like a plain frequency count;
        // the point is that it answers for a slice without touching the rest.
        trendFrom: String(info?.corpusMeta?.firstTimestamp ?? 1),
        trendTo: String((info?.corpusMeta?.firstTimestamp ?? 1) + 86400),
      }));
    } catch (err) {
      setCorpusStatus(err.message);
    } finally {
      setBusy(false);
    }
  }, [announceState, info]);

  const reset = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.reset();
    setResults({});
    setCorpusRun(null);
    setCorpusStatus(null);
    setSnapshot(runtime.snapshot());
    setTsOverridden(false);
    setAnnouncement('Reset. No users, no posts, no topics.');
    setFields({
      addUser: '', postUser: '', postText: '', postTs: '1', deleteUser: '',
      postsUser: '', postsTopic: '', trendFrom: '1', trendTo: '3',
    });
  }, []);

  /* ── Derived bits for the composer ─────────────────────────────── */

  const postLength = codePointLength(fields.postText);
  const overLimit = postLength > maxLength;
  const runs = useMemo(
    () => splitTopics(fields.postText, topicPattern),
    [fields.postText, topicPattern],
  );
  const parsedTopics = useMemo(() => {
    const seen = [];
    runs.forEach((run) => {
      if (run.topic && !seen.includes(run.topic)) seen.push(run.topic);
    });
    return seen;
  }, [runs]);
  // The thing worth pointing at: a '#' run that stopped early because the next
  // character is outside [0-9a-zA-Z_]. "#café" is the canonical example.
  const truncatedTopic = useMemo(() => {
    if (!topicPattern) return null;
    for (let i = 0; i < runs.length; i += 1) {
      const run = runs[i];
      const next = runs[i + 1];
      if (!run.topic || !next || next.topic) continue;
      const nextChar = next.text[0];
      if (nextChar && !/\s/.test(nextChar) && !/[0-9a-zA-Z_]/.test(nextChar)) {
        return { topic: run.topic, stoppedAt: nextChar };
      }
    }
    return null;
  }, [runs, topicPattern]);

  const userNames = snapshot?.users.map((u) => u.name) ?? [];

  /* How many rows the open pane would have if nothing were capped. Compared
     against snapshot.shown to decide whether the truncation note applies to
     this pane in particular. */
  const paneTotal = snapshot
    ? (statePane === 'topics'
      ? snapshot.totals.topics
      : statePane === 'users'
        ? snapshot.totals.users
        : snapshot.totals.posts)
    : 0;

  /* The six cards, built once and handed to whichever tab is open. Both
     tabs get the same card, the same handler and the same state; the only
     thing that differs is the order, which CARD_ORDER decides. */
  const methodCards = {
    add_user: (
      <MethodCard
        key="add_user"
        name="add-user"
        signature="add_user(user_name)"
        note="Registers a name. Raises if it is already taken."
        result={results.add_user}
        busy={busy}
        onSubmit={() => {
          run('add_user', [fields.addUser]);
          setField('addUser', '');
        }}
      >
        <div className="yo-field">
          <label htmlFor="yo-add-user">User name</label>
          <input
            id="yo-add-user"
            type="text"
            value={fields.addUser}
            onChange={(e) => setField('addUser', e.target.value)}
            placeholder="john"
            autoComplete="off"
          />
        </div>
        <button type="submit" className="yo-button" disabled={busy || !fields.addUser}>
          Add user
        </button>
      </MethodCard>
    ),

    /* add_post gets the most room: it is where the character limit,
       the topic parser and the timestamp rule all show up. */
    add_post: (
      <MethodCard
        key="add_post"
        name="add-post"
        signature="add_post(user_name, post_text, timestamp)"
        note="Raises on an unregistered user, on text over the limit, and on a timestamp that does not strictly increase."
        result={results.add_post}
        busy={busy}
        onSubmit={() => {
          const ts = Number(fields.postTs);
          const result = run('add_post', [
            fields.postUser,
            fields.postText,
            Number.isFinite(ts) ? ts : fields.postTs,
          ]);
          if (result?.ok) {
            setField('postText', '');
            setTsOverridden(false);
          }
        }}
      >
        <div className="yo-field-row">
          <div className="yo-field">
            <label htmlFor="yo-post-user">User name</label>
            <input
              id="yo-post-user"
              type="text"
              list="yo-user-list"
              value={fields.postUser}
              onChange={(e) => setField('postUser', e.target.value)}
              placeholder="john"
              autoComplete="off"
            />
          </div>
          <div className="yo-field yo-field-narrow">
            <label htmlFor="yo-post-ts">Timestamp</label>
            <input
              id="yo-post-ts"
              type="number"
              value={fields.postTs}
              onChange={(e) => { setField('postTs', e.target.value); setTsOverridden(true); }}
              aria-describedby="yo-ts-help"
            />
          </div>
        </div>
        <p className="yo-help" id="yo-ts-help">
          {tsOverridden
            ? <>Overridden. Next free value is <code>{nextTimestamp}</code> — anything at or below{' '}
              <code>{snapshot?.lastTimestamp ?? '—'}</code> will be rejected.</>
            : <>Defaults to the last timestamp plus one. Edit it to try the monotonicity rule.</>}
        </p>

        <div className="yo-field">
          <label htmlFor="yo-post-text">Post text</label>
          {/* The highlighted copy sits behind a transparent textarea.
              Both use identical metrics so the runs line up with the
              real characters as they are typed. */}
          <div className="yo-composer">
            <div className="yo-composer-backdrop" aria-hidden="true">
              {runs.map((run_, i) => (
                run_.topic
                  ? <mark key={i} className="yo-topic-mark">{run_.text}</mark>
                  : <span key={i}>{run_.text}</span>
              ))}
              {'\n'}
            </div>
            <textarea
              id="yo-post-text"
              className={`yo-composer-input${overLimit ? ' yo-over' : ''}`}
              value={fields.postText}
              rows={3}
              onChange={(e) => setField('postText', e.target.value)}
              placeholder="eating #steak for dinner"
              aria-describedby="yo-post-counter yo-topic-readout"
              spellCheck="false"
            />
          </div>
        </div>

        <div className="yo-composer-meta">
          <span
            id="yo-post-counter"
            className={`yo-counter${overLimit ? ' yo-counter-over' : ''}`}
          >
            {postLength} / {maxLength}
            {overLimit && <> · {postLength - maxLength} over, Python will reject this</>}
          </span>
          <span className="yo-topic-readout" id="yo-topic-readout">
            {parsedTopics.length === 0
              ? 'no topics'
              : (
                <>
                  topics:{' '}
                  {/* The commas are for the ear, not the eye: this element is
                      the textarea's aria-describedby, and without a separator
                      a screen reader runs the chips together into one word. */}
                  {parsedTopics.map((t, i) => (
                    <React.Fragment key={t}>
                      {i > 0 && <span className="yo-chip-sep">, </span>}
                      <code className="yo-topic-chip">{t}</code>
                    </React.Fragment>
                  ))}
                </>
              )}
          </span>
        </div>

        {truncatedTopic && (
          <p className="yo-note-inline">
            <code>#{truncatedTopic.topic}</code> stops at{' '}
            <code>{truncatedTopic.stoppedAt}</code>. A topic is <code>#</code> followed
            by one or more of <code>[0-9a-zA-Z_]</code>, and that set has no accented
            letters in it — so <code>#café</code> yields the topic{' '}
            <code>caf</code>, not <code>café</code>.
          </p>
        )}

        <div className="yo-inline-actions">
          <button type="submit" className="yo-button" disabled={busy || !fields.postUser}>
            Add post
          </button>
          <button
            type="button"
            className="yo-link-button"
            onClick={() => setField('postText', 'first #café and then #a_1 #b-c')}
          >
            Try the accent case
          </button>
          <button
            type="button"
            className="yo-link-button"
            onClick={() => setField('postText', 'x'.repeat(maxLength + 1))}
          >
            Try {maxLength + 1} characters
          </button>
        </div>
      </MethodCard>
    ),

    delete_user: (
      <MethodCard
        key="delete_user"
        name="delete-user"
        signature="delete_user(user_name)"
        note="Removes the user and every post they wrote, from all three indexes. The expensive one: the timeline is rebuilt."
        result={results.delete_user}
        busy={busy}
        onSubmit={() => run('delete_user', [fields.deleteUser])}
      >
        <div className="yo-field">
          <label htmlFor="yo-delete-user">User name</label>
          <input
            id="yo-delete-user"
            type="text"
            list="yo-user-list"
            value={fields.deleteUser}
            onChange={(e) => setField('deleteUser', e.target.value)}
            placeholder="john"
            autoComplete="off"
          />
        </div>
        <button type="submit" className="yo-button" disabled={busy || !fields.deleteUser}>
          Delete user
        </button>
      </MethodCard>
    ),

    get_posts_for_user: (
      <MethodCard
        key="get_posts_for_user"
        name="posts-for-user"
        signature="get_posts_for_user(user_name)"
        note="That user's posts, newest first. Raises on an unknown user."
        result={results.get_posts_for_user}
        emptyNote="Registered, but has not posted."
        busy={busy}
        onSubmit={() => run('get_posts_for_user', [fields.postsUser])}
      >
        <div className="yo-field">
          <label htmlFor="yo-posts-user">User name</label>
          <input
            id="yo-posts-user"
            type="text"
            list="yo-user-list"
            value={fields.postsUser}
            onChange={(e) => setField('postsUser', e.target.value)}
            placeholder="john"
            autoComplete="off"
          />
        </div>
        <button type="submit" className="yo-button" disabled={busy || !fields.postsUser}>
          Get posts
        </button>
      </MethodCard>
    ),

    get_posts_for_topic: (
      <MethodCard
        key="get_posts_for_topic"
        name="posts-for-topic"
        signature="get_posts_for_topic(topic)"
        note="Posts mentioning a topic, newest first. An unknown topic is an empty list, not an error — topics are never registered."
        result={results.get_posts_for_topic}
        emptyNote="No post mentions that topic. Note this is not an error."
        busy={busy}
        onSubmit={() => run('get_posts_for_topic', [fields.postsTopic])}
      >
        <div className="yo-field">
          <label htmlFor="yo-posts-topic">Topic (without the #)</label>
          <input
            id="yo-posts-topic"
            type="text"
            list="yo-topic-list"
            value={fields.postsTopic}
            onChange={(e) => setField('postsTopic', e.target.value)}
            placeholder="steak"
            autoComplete="off"
          />
        </div>
        <button type="submit" className="yo-button" disabled={busy || !fields.postsTopic}>
          Get posts
        </button>
      </MethodCard>
    ),

    get_trending_topics: (
      <MethodCard
        key="get_trending_topics"
        name="trending"
        signature="get_trending_topics(from_timestamp, to_timestamp)"
        note="Topics in an inclusive window, most mentions first, ties broken alphabetically. Raises if the window runs backwards."
        result={results.get_trending_topics}
        emptyNote="No posts in that window."
        busy={busy}
        onSubmit={() => run('get_trending_topics', [
          Number(fields.trendFrom), Number(fields.trendTo),
        ])}
      >
        <div className="yo-field-row">
          <div className="yo-field yo-field-narrow">
            <label htmlFor="yo-trend-from">From timestamp</label>
            <input
              id="yo-trend-from"
              type="number"
              value={fields.trendFrom}
              onChange={(e) => setField('trendFrom', e.target.value)}
            />
          </div>
          <div className="yo-field yo-field-narrow">
            <label htmlFor="yo-trend-to">To timestamp</label>
            <input
              id="yo-trend-to"
              type="number"
              value={fields.trendTo}
              onChange={(e) => setField('trendTo', e.target.value)}
            />
          </div>
        </div>
        <div className="yo-inline-actions">
          <button type="submit" className="yo-button" disabled={busy}>
            Get trending topics
          </button>
          {snapshot?.totals.posts > 0 && (
            <button
              type="button"
              className="yo-link-button"
              onClick={() => {
                // From the snapshot's own extent fields, not off the
                // timeline list: that is only the last 200 rows once
                // the tweet corpus is loaded.
                setField('trendFrom', String(snapshot.firstTimestamp));
                setField('trendTo', String(snapshot.latestTimestamp));
              }}
            >
              Widen to everything
            </button>
          )}
          <button
            type="button"
            className="yo-link-button"
            onClick={() => {
              setField('trendFrom', '5');
              setField('trendTo', '4');
            }}
          >
            Try a backwards window
          </button>
        </div>
      </MethodCard>
    ),
  };

  /* ── Loading and failure ───────────────────────────────────────── */

  if (status.state === 'error') {
    return (
      <div className="project-page-container">
        <h1>Yodelr</h1>
        <div className="vertical-card yo-boot yo-boot-error">
          <h2>The page could not start</h2>
          <p>{status.message}</p>
          <p className="yo-boot-note">
            The page runs the Python implementation itself rather than a copy of it, so it
            needs the Pyodide runtime to download before anything works. A reload usually
            fixes a one-off network failure.
          </p>
          <button type="button" className="yo-button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="project-page-container">
      <h1>Yodelr</h1>

      {/* Off-screen but not display:none, which would take it out of the
          accessibility tree along with the viewport. Present from first render
          so that it is already being watched when the first message arrives. */}
      <p className="yo-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      {/* The tab strip is up immediately, not after boot. Timing needs no
          Python, so making it unreachable for the ten seconds the interpreter
          takes to arrive would be gating it on something it does not use. */}
      <div className="yo-maintabs" role="tablist" aria-label="Yodelr">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`yo-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`yo-panel-${key}`}
            className={`yo-maintab${tab === key ? ' yo-maintab-active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {!ready && tab !== 'timing' && (
        <div className="vertical-card yo-boot" role="status" aria-live="polite">
          <div className="yo-spinner" aria-hidden="true" />
          <h2>Starting Python in your browser</h2>
          <p>{status.message}</p>
          <p className="yo-boot-note">
            This takes a few seconds the first time. A whole CPython interpreter
            (about 10&nbsp;MB of WebAssembly) has to arrive and start up before the first
            call can run. After that every call is instant, and the browser caches the
            runtime for next time.
          </p>
          <div className="yo-skeleton" aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>
      )}

      {/* Not gated on `ready`: this tab shows recorded measurements and needs
          no Python at all, so there is no reason to make it wait for a 10 MB
          interpreter to finish downloading. */}
      {tab === 'timing' && <BenchmarkPanel />}

      {ready && tab !== 'timing' && (
        <div
          role="tabpanel"
          id={`yo-panel-${tab}`}
          aria-labelledby={`yo-tab-${tab}`}
        >
          {/* ── What is loaded ─────────────────────────────────── */}
          <div className="yo-toolbar">
            <div className="yo-toolbar-buttons">
              {tab === 'manual'
                ? (
                  <button type="button" className="yo-button" onClick={loadWalkthrough} disabled={busy}>
                    Load the spec example
                  </button>
                )
                : (
                  <button type="button" className="yo-button" onClick={loadCorpus} disabled={busy}>
                    {corpusRun ? 'Load it again' : 'Load the tweet corpus'}
                  </button>
                )}
              <button type="button" className="yo-button yo-button-quiet" onClick={reset} disabled={busy}>
                Reset
              </button>
            </div>

            {tab === 'manual' && (
              <p className="yo-toolbar-note">
                Start empty and type, or load the walkthrough from the spec: john posts three
                times, and <code>get_trending_topics(1, 3)</code> returns{' '}
                <code>["steak", "chilling"]</code>.
              </p>
            )}

            {tab === 'corpus' && (
              <p className="yo-toolbar-note">
                {thousands(info?.corpusMeta?.posts)} real tweets from{' '}
                {thousands(info?.corpusMeta?.users)} authors, replayed through{' '}
                <code>yodelr.py</code>. They are the{' '}
                <a href={info?.corpusMeta?.datasetUrl} target="_blank" rel="noreferrer">
                  Sentiment140
                </a>{' '}
                dump from 2009 — the year the limit really was 140 characters — filtered down
                to the posts that carry a <code>#hashtag</code>, because only 2.2% of them do
                and a straight slice would leave the topic index with nothing to do. Text and
                author are the dump's own, and the order is its own timestamps; the only edit
                is that tweets landing on the same second are nudged one second apart, because
                Yodelr requires timestamps to strictly increase. About{' '}
                {Math.round((info?.corpusMeta?.bytesGzipped ?? 0) / 1e5) / 10}&nbsp;MB to
                download.
              </p>
            )}

            {tab === 'corpus' && corpusStatus && (
              <p className="yo-toolbar-note yo-corpus-status" role="status">
                {corpusStatus}
              </p>
            )}

            {tab === 'corpus' && corpusRun && (
              <p className="yo-toolbar-note yo-corpus-stats">
                Replayed {thousands(corpusRun.posts)} posts in{' '}
                <strong>{formatMs(corpusRun.addPostMs)}</strong>, which is{' '}
                {corpusRun.perPostUs.toFixed(1)}&nbsp;µs per <code>add_post</code>. Registering
                the {thousands(corpusRun.users)} users took {formatMs(corpusRun.addUserMs)};
                unzipping and parsing the file, which is not Yodelr's work, took{' '}
                {formatMs(corpusRun.parseMs)}.
              </p>
            )}
          </div>

          <div className="yo-layout">
            {/* ── The six methods ──────────────────────────────── */}
            <div className="yo-methods">
              <h2>The API</h2>

              {CARD_ORDER[tab].map((key) => methodCards[key])}
            </div>

            {/* ── State panel ──────────────────────────────────── */}
            <aside className="yo-state" aria-label="Current state of the system">
              <h2>State</h2>
              <p className="yo-state-note">
                Read straight out of the live object after every call. These are the
                implementation's three indexes: a post is filed in all of them at once,
                which is how each query returns already in the right order.
              </p>

              {/* The totals are always the true totals, read off the live object.
                  Only the lists below them are capped — see the note after the
                  tab strip. */}
              <div className="yo-totals">
                <div className="yo-total">
                  <span className="yo-total-value">{thousands(snapshot?.totals.users ?? 0)}</span>
                  <span className="yo-total-label">users</span>
                </div>
                <div className="yo-total">
                  <span className="yo-total-value">{thousands(snapshot?.totals.posts ?? 0)}</span>
                  <span className="yo-total-label">posts</span>
                </div>
                <div className="yo-total">
                  <span className="yo-total-value">{thousands(snapshot?.totals.topics ?? 0)}</span>
                  <span className="yo-total-label">topics</span>
                </div>
                <div className="yo-total">
                  <span className="yo-total-value">{snapshot?.lastTimestamp ?? '—'}</span>
                  <span className="yo-total-label">last ts</span>
                </div>
              </div>

              <div className="yo-tabs" role="group" aria-label="Which index to show">
                {[
                  ['topics', '_posts_by_topic'],
                  ['users', '_posts_by_user'],
                  ['timeline', '_timeline'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`yo-tab${statePane === key ? ' yo-tab-active' : ''}`}
                    aria-pressed={statePane === key}
                    onClick={() => setStatePane(key)}
                  >
                    <code>{label}</code>
                  </button>
                ))}
              </div>

              {/* With the tweet corpus loaded there are 25k users and 13k topics.
                  Rendering those as DOM nodes would cost far more than the calls
                  being measured, so the snapshot is capped. Say so rather than
                  letting the panel look complete. The cap applies per list, so
                  the note is worked out per pane: whether topics are cut says
                  nothing about whether users are. */}
              {snapshot?.truncated && paneTotal > snapshot.shown && (
                <p className="yo-trunc-note">
                  Showing {statePane === 'timeline' ? 'the latest' : 'the busiest'}{' '}
                  {thousands(snapshot.shown)} of {thousands(paneTotal)}{' '}
                  {statePane === 'timeline' ? 'posts' : statePane}. The object holds
                  all of them — only this list is cut, so the page stays quick.
                </p>
              )}

              <div className="yo-state-body">
                {snapshot?.totals.posts === 0 && snapshot?.totals.users === 0 && (
                  <p className="yo-empty-note">
                    Empty. Add a user, or load one of the scenarios above.
                  </p>
                )}

                {statePane === 'topics' && (
                  snapshot?.topics.length ? (
                    <ul className="yo-list yo-topic-list">
                      {snapshot.topics.map((topic) => (
                        <li key={topic.name}>
                          <button
                            type="button"
                            className="yo-row-button"
                            onClick={() => {
                              setField('postsTopic', topic.name);
                              run('get_posts_for_topic', [topic.name]);
                            }}
                          >
                            <code>{topic.name}</code>
                          </button>
                          {/* Bar width is relative to the busiest topic, so the
                              shape of the distribution is readable at a glance. */}
                          <span className="yo-bar-wrap">
                            <span
                              className="yo-bar"
                              style={{
                                width: `${Math.max(
                                  4,
                                  (topic.postCount / snapshot.topics[0].postCount) * 100,
                                )}%`,
                              }}
                            />
                          </span>
                          <span className="yo-count">{topic.postCount}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="yo-empty-note">No topics yet.</p>
                )}

                {statePane === 'users' && (
                  snapshot?.users.length ? (
                    <ul className="yo-list">
                      {snapshot.users.map((user) => (
                        <li key={user.name}>
                          <button
                            type="button"
                            className="yo-row-button"
                            onClick={() => {
                              setField('postsUser', user.name);
                              run('get_posts_for_user', [user.name]);
                            }}
                          >
                            {user.name}
                          </button>
                          <span className="yo-count">
                            {user.postCount} {user.postCount === 1 ? 'post' : 'posts'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="yo-empty-note">No users yet.</p>
                )}

                {statePane === 'timeline' && (
                  snapshot?.timeline.length ? (
                    <ol className="yo-timeline">
                      {/* Newest first on screen; the stored list is oldest first. */}
                      {[...snapshot.timeline].reverse().map((post) => (
                        <li key={`${post.ts}-${post.user}`}>
                          <span className="yo-timeline-head">
                            <code className="yo-ts">{post.ts}</code>
                            <span className="yo-timeline-user">{post.user}</span>
                          </span>
                          <span className="yo-timeline-text">
                            {splitTopics(post.text, topicPattern).map((run_, i) => (
                              run_.topic
                                ? <mark key={i} className="yo-topic-mark">{run_.text}</mark>
                                : <span key={i}>{run_.text}</span>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="yo-empty-note">No posts yet.</p>
                )}
              </div>
            </aside>
          </div>

          {/* Shared suggestion lists for the user and topic inputs. Free text is
              still allowed, so typing a name that does not exist to see the
              error remains possible. */}
          <datalist id="yo-user-list">
            {userNames.map((name) => <option key={name} value={name} />)}
          </datalist>
          <datalist id="yo-topic-list">
            {(snapshot?.topics ?? []).map((t) => <option key={t.name} value={t.name} />)}
          </datalist>

        </div>
      )}
    </div>
  );
};

export default YodelrPlayground;

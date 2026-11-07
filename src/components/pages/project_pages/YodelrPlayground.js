import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './CommonStyles.css';
import './YodelrPlayground.css';
import { loadRuntime } from '../../../yodelr/runtime';
import { WALKTHROUGH, SAMPLE, SAMPLE_RANGE } from '../../../yodelr/sampleData';

/* The Yodelr playground.
 *
 * Every button here calls the real yodelr.py, running under Pyodide. There is
 * no JavaScript reimplementation anywhere in this file: when a call returns a
 * list, Python sorted it, and when it raises, Python raised.
 */

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
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [statePane, setStatePane] = useState('topics');
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
    document.title = 'Yodelr playground · gillesvandevyver.com';
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
          constants: runtime.constants,
          pythonVersion: runtime.pythonVersion,
          pyodideVersion: runtime.pyodideVersion,
          abstractMethods: runtime.abstractMethods,
          source: runtime.source,
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

  /* Every call goes through here: run it, record it, refresh the state panel. */
  const run = useCallback((method, args, { label } = {}) => {
    const runtime = runtimeRef.current;
    if (!runtime) return null;

    setBusy(true);
    try {
      const result = runtime.call(method, args);
      setResults((prev) => ({ ...prev, [method]: result }));
      setLog((prev) => [{
        id: `${Date.now()}-${prev.length}`,
        method,
        label: label || `${method}(${args.map((a) => JSON.stringify(a)).join(', ')})`,
        ok: result.ok,
        ms: result.ms,
        summary: result.ok
          ? (Array.isArray(result.value)
            ? `${result.value.length} item${result.value.length === 1 ? '' : 's'}`
            : 'None')
          : result.error,
        errorType: result.errorType,
      }, ...prev].slice(0, 60));
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

  const loadBulk = useCallback((data, label, after) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setBusy(true);
    try {
      runtime.reset();
      const result = runtime.bulkAdd(data.users, data.posts);
      setResults({});
      setLog([{
        id: `${Date.now()}-bulk`,
        method: 'bulk',
        label,
        ok: result.ok,
        ms: result.ms,
        summary: result.ok
          ? `${data.users.length} users, ${data.posts.length} posts`
          : result.error,
        errorType: result.errorType,
      }]);
      const next = runtime.snapshot();
      setSnapshot(next);
      setTsOverridden(false);
      setAnnouncement(
        `${label}. ${next.totals.users} users, ${next.totals.posts} posts, `
        + `${next.totals.topics} topics.`,
      );
      if (after) after();
    } finally {
      setBusy(false);
    }
  }, []);

  const loadWalkthrough = () => loadBulk(WALKTHROUGH, 'Load example (spec walkthrough)', () => {
    setFields((prev) => ({
      ...prev,
      postUser: 'john',
      deleteUser: 'john',
      postsUser: 'john',
      postsTopic: 'steak',
      trendFrom: '1',
      trendTo: '3',
    }));
  });

  const loadSample = () => loadBulk(SAMPLE, 'Load sample data', () => {
    setFields((prev) => ({
      ...prev,
      postUser: 'ada',
      deleteUser: 'bjorn',
      postsUser: 'ada',
      postsTopic: 'sourdough',
      trendFrom: String(SAMPLE_RANGE.from),
      trendTo: String(SAMPLE_RANGE.to),
    }));
  });

  const reset = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.reset();
    setResults({});
    setLog([]);
    setSnapshot(runtime.snapshot());
    setTsOverridden(false);
    setAnnouncement('Reset. No users, no posts, no topics.');
    setFields({
      addUser: '', postUser: '', postText: '', postTs: '1', deleteUser: '',
      postsUser: '', postsTopic: '', trendFrom: '1', trendTo: '3',
    });
  };

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

  /* ── Loading and failure ───────────────────────────────────────── */

  if (status.state === 'error') {
    return (
      <div className="project-page-container">
        <h1>Yodelr playground</h1>
        <div className="vertical-card yo-boot yo-boot-error">
          <h2>The playground could not start</h2>
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
      <h1>Yodelr playground</h1>

      {/* Off-screen but not display:none, which would take it out of the
          accessibility tree along with the viewport. Present from first render
          so that it is already being watched when the first message arrives. */}
      <p className="yo-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="yo-intro">
        <p>
          Yodelr is a micro-blogging service: users register, post up to 140 characters,
          tag posts with <code>#topics</code>, and ask what was trending between two points
          in time. It was a coding challenge, and the interesting part is not the feature
          list but the data structures underneath — each query has to come back in sorted
          order without sorting anything at call time.
        </p>
        <p>
          This page is the implementation I submitted, running. Not a port of it, not a
          description of it: the actual <code>yodelr.py</code> is downloaded into your
          browser and executed by a real CPython compiled to WebAssembly. Every list below
          came out of Python, and every error message is one Python raised.
        </p>
      </div>

      {/* ── Status bar ───────────────────────────────────────────── */}
      <div className="yo-statusbar">
        <span className="yo-status-left">
          <span className={`yo-dot yo-dot-${status.state}`} />
          {ready
            ? (
              <span>
                CPython {info.pythonVersion} on Pyodide {info.pyodideVersion} ·{' '}
                <code>yodelr.py</code> {info.provenance?.lines} lines
                {info.provenance?.sha256 && (
                  <> · sha256 <code>{info.provenance.sha256.slice(0, 12)}</code></>
                )}
              </span>
            )
            : <span>{status.message}</span>}
        </span>
        {ready && (
          <button
            type="button"
            className="yo-link-button"
            onClick={() => setShowSource((v) => !v)}
            aria-expanded={showSource}
          >
            {showSource ? 'Hide the source' : 'Show the source that is running'}
          </button>
        )}
      </div>

      {showSource && ready && (
        <div className="yo-source-panel">
          <p className="yo-source-note">
            Byte-for-byte what is executing, fetched from <code>/yodelr/yodelr.py</code>. It is
            copied out of the challenge repository by a script at build time
            (<code>npm run yodelr:sync</code>) and never edited here, so this page cannot
            drift away from the submission.
          </p>
          <pre className="yo-source"><code>{info.source}</code></pre>
        </div>
      )}

      {!ready && (
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

      {ready && (
        <>
          {/* ── Scenario buttons ───────────────────────────────── */}
          <div className="yo-toolbar">
            <div className="yo-toolbar-buttons">
              <button type="button" className="yo-button" onClick={loadWalkthrough} disabled={busy}>
                Load example
              </button>
              <button type="button" className="yo-button" onClick={loadSample} disabled={busy}>
                Load sample data
              </button>
              <button type="button" className="yo-button yo-button-quiet" onClick={reset} disabled={busy}>
                Reset
              </button>
            </div>
            <p className="yo-toolbar-note">
              <strong>Load example</strong> is the walkthrough from the spec: john posts three
              times, and <code>get_trending_topics(1, 3)</code> should return
              {' '}<code>["steak", "chilling"]</code>.{' '}
              <strong>Load sample data</strong> is {SAMPLE.posts.length} posts from{' '}
              {SAMPLE.users.length} users with a deliberately lopsided topic distribution —
              good for watching trending change shape as you move the window, and for
              seeing what <code>delete_user</code> costs. Try deleting <code>bjorn</code>,
              who is almost single-handedly responsible for <code>#sourdough</code>.
            </p>
          </div>

          <div className="yo-layout">
            {/* ── The six methods ──────────────────────────────── */}
            <div className="yo-methods">
              <h2>The API</h2>

              <MethodCard
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

              {/* add_post gets the most room: it is where the character limit,
                  the topic parser and the timestamp rule all show up. */}
              <MethodCard
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

              <MethodCard
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

              <MethodCard
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

              <MethodCard
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

              <MethodCard
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
                        setField('trendFrom', String(snapshot.timeline[0].ts));
                        setField('trendTo', String(snapshot.timeline[snapshot.timeline.length - 1].ts));
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
            </div>

            {/* ── State panel ──────────────────────────────────── */}
            <aside className="yo-state" aria-label="Current state of the system">
              <h2>State</h2>
              <p className="yo-state-note">
                Read straight out of the live object after every call. These are the
                implementation's three indexes: a post is filed in all of them at once,
                which is how each query returns already in the right order.
              </p>

              <div className="yo-totals">
                <div className="yo-total">
                  <span className="yo-total-value">{snapshot?.totals.users ?? 0}</span>
                  <span className="yo-total-label">users</span>
                </div>
                <div className="yo-total">
                  <span className="yo-total-value">{snapshot?.totals.posts ?? 0}</span>
                  <span className="yo-total-label">posts</span>
                </div>
                <div className="yo-total">
                  <span className="yo-total-value">{snapshot?.totals.topics ?? 0}</span>
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

          {/* ── Call log ─────────────────────────────────────── */}
          <div className="vertical-card yo-log-card">
            <h2>Call log</h2>
            <p className="yo-state-note">
              Timed inside Python with <code>perf_counter()</code> around the method call
              alone, so the numbers are the implementation rather than the browser talking
              to it. Watch <code>delete_user</code> against the others once the sample data
              is loaded: it is the only operation that depends on the total number of posts,
              because it rebuilds the timeline.
            </p>
            {log.length === 0
              ? <p className="yo-empty-note">Nothing called yet.</p>
              : (
                <ol className="yo-log">
                  {log.map((entry) => (
                    <li key={entry.id} className={entry.ok ? 'yo-log-ok' : 'yo-log-error'}>
                      <code className="yo-log-call">{entry.label}</code>
                      <span className="yo-log-summary">
                        {entry.ok ? entry.summary : `${entry.errorType}: ${entry.summary}`}
                      </span>
                      <span className="yo-log-ms">{formatMs(entry.ms)}</span>
                    </li>
                  ))}
                </ol>
              )}
          </div>

          {/* ── Prose ────────────────────────────────────────── */}
          <div className="vertical-card">
            <div className="yo-prose">
              <h2>How this page works</h2>

              <h3>Is this really the submitted code?</h3>
              <p>
                Yes, and the setup is arranged so that it cannot quietly stop being true. A
                build script copies <code>yodelr.py</code> out of the challenge repository
                into this site's static assets and records its SHA-256; nothing in this
                repository contains a second copy of the logic to fall out of step. The hash
                in the status bar is of the file your browser just executed, and
                &ldquo;{showSource ? 'Hide' : 'Show'} the source&rdquo; prints the file
                itself. The implementation is untouched — the challenge forbids altering the
                provided interface, so the page wraps it from the outside, exactly as the
                unit tests do.
              </p>

              <h3>How does Python run in a browser?</h3>
              <p>
                Pyodide is CPython compiled to WebAssembly. The page downloads the
                interpreter, writes <code>yodelr.py</code> to its virtual filesystem and
                imports it. Yodelr needs nothing outside the standard library — the
                challenge requires that — so there are no packages to install, and the whole
                thing is a static file download with no backend anywhere.
              </p>

              <h3>Why does the timing matter?</h3>
              <p>
                Because the challenge is really about complexity. Every read here answers
                from an index that is already in the right order: a user's posts and a
                topic's posts are stored newest-last and walked backwards, and trending
                binary-searches the timeline for the window bounds rather than scanning it.
                Nothing sorts a whole dataset at call time. The one deliberate exception is{' '}
                <code>delete_user</code>, which rebuilds the timeline and so costs time
                proportional to every post in the system, not just the deleted user's. That
                was a trade: deletes are rare, trending is not, and the alternative — leaving
                dead posts in place and skipping them while reading — makes the common case
                slowly degrade.
              </p>

              <h3>Why does <code>#café</code> give <code>caf</code>?</h3>
              <p>
                The spec defines a topic as <code>#</code> followed by one or more characters
                from <code>[0-9a-zA-Z_]</code>, and that is what the implementation matches.
                It would have been shorter to write <code>\w</code>, but <code>\w</code> also
                matches accented and non-Latin letters, which would quietly accept more than
                the spec allows. So the parser stops at the <code>é</code> and the topic is{' '}
                <code>caf</code>. It looks like a bug and is the opposite of one, which is
                why the composer above shows you where the match ended rather than hiding it.
              </p>

              <h3>What is not here</h3>
              <p>
                The benchmark. The repository also runs this implementation over a corpus of
                1.6 million real tweets to check it behaves on data it did not choose for
                itself; that needs a dataset far too large to ship to a browser, so it stays
                a thing you run locally. This page is for poking at the semantics by hand —
                especially the edges, which is why every error above is surfaced rather than
                swallowed.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default YodelrPlayground;

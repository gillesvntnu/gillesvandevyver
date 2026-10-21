import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './CommonStyles.css';
import './InteractiveRag.css';
import { loadIndex, retrieve, bestPassage, highlight, confidenceOf } from '../../../rag/retriever';
import { loadEmbedder } from '../../../rag/embedder';
import { synthesizeAnswer, PROVIDERS } from '../../../rag/synthesize';
import embeddingSpace from '../../../images/rag/embedding_space.jpg';
import norwayTour from '../../../images/rag/norway_tour.jpg';

// Chosen to show the two halves of the hybrid doing different jobs rather than
// to flatter it. "Stay upright" shares no word with "self-stability", so only
// the semantic half finds it; "trail" is the steering term swamped in the
// corpus by trail-riding and rail-trails, where it means a path.
const SUGGESTIONS = [
  'Why does a moving bicycle stay upright on its own?',
  'How do rim brakes differ from disc brakes?',
  'What is trail in bicycle steering geometry?',
  'How does an internal hub gear work?',
  'What causes speed wobble in the front wheel?',
  'Do bicycle helmets reduce the risk of head injury?',
];

// The licence name comes from the index, not from here, so that rebuilding over
// a differently-licensed corpus changes the notice rather than leaving a false
// one in place. This map only turns that name into a link; an unrecognised
// licence still gets named, it just does not get linked.
const LICENCE_URLS = {
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
};

const KEY_STORAGE = 'rag-api-key';
const PROVIDER_STORAGE = 'rag-api-provider';

/** sessionStorage is unavailable in some privacy modes; never let that break the page. */
function readSession(key, fallback = '') {
  try {
    return window.sessionStorage.getItem(key) ?? fallback;
  } catch (err) {
    return fallback;
  }
}

function writeSession(key, value) {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch (err) { /* ignore: the key simply won't survive a reload */ }
}

function Highlighted({ text, query }) {
  return (
    <>
      {highlight(text, query).map((run, i) => (
        run.highlight
          ? <mark key={i} className="rag-mark">{run.text}</mark>
          : <React.Fragment key={i}>{run.text}</React.Fragment>
      ))}
    </>
  );
}

/** Renders model prose, turning [1][2] markers into links to the source cards. */
function AnswerText({ text, messageId, sourceCount }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="rag-answer-text">
      {parts.map((part, i) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) return <React.Fragment key={i}>{part}</React.Fragment>;
        const n = Number(match[1]);
        if (n < 1 || n > sourceCount) return <React.Fragment key={i}>{part}</React.Fragment>;
        return (
          <a
            key={i}
            href={`#source-${messageId}-${n}`}
            className="rag-citation"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(`source-${messageId}-${n}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }}
          >
            {n}
          </a>
        );
      })}
    </p>
  );
}

function SourceCard({ chunk, index, query, messageId, expandedByDefault }) {
  const [expanded, setExpanded] = useState(expandedByDefault);
  const passage = useMemo(() => bestPassage(chunk, query), [chunk, query]);
  const doc = chunk.document || {};
  const hasPages = chunk.page !== undefined && chunk.page !== null;
  const pages = chunk.pageEnd > chunk.page ? `pp. ${chunk.page}-${chunk.pageEnd}` : `p. ${chunk.page}`;
  // Deep-link into the article section when the source is a web page, so the
  // "read it in context" click lands on the paragraph rather than the top.
  const sourceHref = doc.url && chunk.anchor && !hasPages
    ? `${doc.url}#${chunk.anchor}`
    : doc.url;

  // An encyclopedia article has no publication year: doc.year is when the
  // extract was fetched, and printing it next to the title would read as a date
  // of authorship. It belongs in the attribution note instead.
  const showYear = Boolean(doc.year) && doc.kind !== 'encyclopedia article';

  // Where in the document this passage sits. A page range if the source has
  // pages; otherwise the section heading, qualified by which part of that
  // section it is whenever the section runs to more than one passage. Without
  // that, two results from one long section cite identically.
  const where = [];
  if (hasPages) where.push(pages);
  const ofParts = chunk.sectionParts > 1 ? ` (${chunk.sectionPart} of ${chunk.sectionParts})` : '';
  if (chunk.section) where.push(`${chunk.section}${ofParts}`);
  else if (ofParts) where.push(`passage ${chunk.sectionPart} of ${chunk.sectionParts}`);

  return (
    <li className="rag-source" id={`source-${messageId}-${index + 1}`}>
      <div className="rag-source-head">
        <span className="rag-source-number">{index + 1}</span>
        <div className="rag-source-meta">
          <span className="rag-source-title">
            {sourceHref
              ? <a href={sourceHref} target="_blank" rel="noopener noreferrer">{doc.title}</a>
              : doc.title}
          </span>
          <span className="rag-source-sub">
            {[`${doc.venue}${showYear ? `, ${doc.year}` : ''}`, ...where].join(' · ')}
          </span>
        </div>
      </div>

      <blockquote className="rag-quote">
        {passage.truncatedStart && <span className="rag-ellipsis">… </span>}
        <Highlighted text={expanded ? chunk.text : passage.text} query={query} />
        {passage.truncatedEnd && !expanded && <span className="rag-ellipsis"> …</span>}
      </blockquote>

      <div className="rag-source-foot">
        <button type="button" className="rag-link-button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : 'Show full passage'}
        </button>
        <span className="rag-scorebar" title="How this passage was found">
          {chunk.semanticRank && <span className="rag-chip rag-chip-semantic">semantic #{chunk.semanticRank}</span>}
          {chunk.lexicalRank && <span className="rag-chip rag-chip-lexical">keyword #{chunk.lexicalRank}</span>}
          {chunk.similarity != null && (
            <span className="rag-chip rag-chip-score">cos {chunk.similarity.toFixed(2)}</span>
          )}
        </span>
      </div>

      {chunk.alsoIn?.length > 0 && (
        <p className="rag-also">
          Near-identical text also appears in {chunk.alsoIn.map((d) => d?.title).filter(Boolean).join('; ')}.
        </p>
      )}
    </li>
  );
}

const InteractiveRag = () => {
  const indexRef = useRef(null);
  const encodeRef = useRef(null);
  const abortRef = useRef(null);
  const transcriptRef = useRef(null);

  const [indexState, setIndexState] = useState({ status: 'loading', error: null });
  const [stats, setStats] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [embedState, setEmbedState] = useState({ status: 'idle', message: '' });

  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState(() => readSession(PROVIDER_STORAGE, 'anthropic'));
  const [apiKey, setApiKey] = useState(() => readSession(KEY_STORAGE, ''));
  const [excluded, setExcluded] = useState(() => new Set());
  const [docQuery, setDocQuery] = useState('');

  useEffect(() => {
    document.title = 'Ask a bike question · gillesvandevyver.com';
  }, []);

  // 1. The index loads first and makes the page usable straight away in
  //    keyword mode. 2. The embedding model is fetched in the background and
  //    upgrades the page to hybrid search when it arrives.
  useEffect(() => {
    let cancelled = false;

    loadIndex()
      .then((index) => {
        if (cancelled) return;
        indexRef.current = index;
        setDocuments(index.documentList);
        setStats({
          chunks: index.chunks.length,
          documents: index.documentList.length,
          builtAt: index.meta.builtAt,
          model: index.meta.model,
          attribution: index.meta.attribution,
        });
        setIndexState({ status: 'ready', error: null });

        setEmbedState({ status: 'loading', message: 'Loading the embedding model…' });
        return loadEmbedder((message) => {
          if (!cancelled && message !== 'ready') setEmbedState({ status: 'loading', message });
        }).then((encode) => {
          if (cancelled) return;
          encodeRef.current = encode;
          setEmbedState({ status: 'ready', message: '' });
        }).catch(() => {
          if (!cancelled) {
            setEmbedState({
              status: 'unavailable',
              message: 'Semantic search could not load; keyword search is still active.',
            });
          }
        });
      })
      .catch((error) => {
        if (!cancelled) setIndexState({ status: 'error', error: error.message });
      });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const docFilter = useMemo(
    () => documents.map((d) => d.id).filter((id) => !excluded.has(id)),
    [documents, excluded],
  );

  const ask = useCallback(async (raw) => {
    const query = raw.trim();
    if (!query || busy || indexState.status !== 'ready') return;

    setQuestion('');
    setBusy(true);
    const messageId = Date.now();

    setMessages((prev) => [
      ...prev,
      { id: `${messageId}-q`, role: 'user', text: query },
      { id: `${messageId}-a`, role: 'assistant', query, stage: 'retrieving', sources: [] },
    ]);

    const update = (patch) => setMessages((prev) => prev.map(
      (m) => (m.id === `${messageId}-a` ? { ...m, ...patch } : m),
    ));

    try {
      let queryVector = null;
      if (encodeRef.current) {
        try {
          queryVector = await encodeRef.current(query);
        } catch (err) {
          queryVector = null; // degrade to keyword-only rather than failing
        }
      }

      const sources = retrieve(indexRef.current, query, queryVector, {
        limit: 6,
        docFilter: docFilter.length === documents.length ? null : docFilter,
      });

      if (!sources.length) {
        update({ stage: 'done', sources: [], empty: true, hybrid: Boolean(queryVector) });
        return;
      }

      update({
        stage: apiKey ? 'generating' : 'done',
        sources,
        hybrid: Boolean(queryVector),
        confidence: confidenceOf(sources),
      });

      if (apiKey) {
        abortRef.current = new AbortController();
        try {
          const answer = await synthesizeAnswer({
            provider,
            apiKey,
            question: query,
            passages: sources,
            signal: abortRef.current.signal,
          });
          update({ stage: 'done', answer });
        } catch (error) {
          if (error.name !== 'AbortError') update({ stage: 'done', answerError: error.message });
        }
      }
    } catch (error) {
      update({ stage: 'done', answerError: error.message });
    } finally {
      setBusy(false);
    }
  }, [apiKey, busy, docFilter, documents.length, indexState.status, provider]);

  const toggleDocument = (id) => setExcluded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // With seven papers the scope control could be seven checkboxes. With 255
  // articles it needs a way in, so the list is filtered by title and scrolls.
  // Matching is on the title alone: the ids are slugs of the titles, so there is
  // nothing else here to match against.
  const visibleDocuments = useMemo(() => {
    const needle = docQuery.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((d) => d.title.toLowerCase().includes(needle));
  }, [documents, docQuery]);

  const modeLabel = embedState.status === 'ready'
    ? 'Hybrid: embeddings + BM25'
    : embedState.status === 'loading'
      ? 'Keyword search (embeddings loading…)'
      : 'Keyword search (BM25)';

  return (
    <div className="project-page-container">
      <h1>Ask a bike question</h1>

      <div className="rag-hero">
        {/* Two images, and the pairing is the point: the index above, the reason
            I built it over bicycles below. The photo is decorative in the strict
            sense, but it still gets real alt text, because a reader who cannot see
            it should get the same "this is his own bike" a sighted reader gets. */}
        <div className="rag-hero-figures">
          <img src={embeddingSpace} alt="" className="rag-hero-image" />
          <figure className="rag-photo">
            <img
              src={norwayTour}
              alt="A loaded touring bicycle leaning against a guardrail on an empty coastal road, with a fjord, low cloud and mountains behind it."
            />
            <figcaption>
              My own bike, somewhere on the ride up the length of Norway.
            </figcaption>
          </figure>
        </div>
        <div className="rag-hero-text">
          <p>
            Ask a question about bicycles and this searches 255 Wikipedia articles about
            them: frames, brakes, gearing, handling physics, infrastructure, racing and
            history. It shows you the passages it found and where they came from.
          </p>
          <p>
            There is no backend. The site is static, so the whole search runs inside your
            browser tab. The index is downloaded once, your question is embedded on your own
            machine, and nothing you type is sent to a server of mine.
          </p>
          <p>
            The corpus is cycling because I love bikes and bikepacking. It is also a good
            test: it mixes careful mechanical explanation with rigid-body dynamics, policy
            argument and narrative history. The engineering below is the point, and it would
            work the same over any other collection of text.
          </p>
          <p className="rag-hero-caption">
            The scatter plot is the index itself: all {stats?.chunks ?? '3,300-odd'} indexed
            passages projected from 384 dimensions down to two, coloured by semantic cluster.
            Passages about the same topic land near each other, which is exactly the property
            the retriever exploits. The clusters are roughly components, handling physics,
            infrastructure and safety, off-road riding, and history.
          </p>
        </div>
      </div>

      <div className="vertical-card rag-card">
        <div className="rag-statusbar">
          <div className="rag-status-left">
            <span className={`rag-dot rag-dot-${indexState.status}`} />
            {indexState.status === 'loading' && <span>Loading index…</span>}
            {indexState.status === 'error' && <span>Index failed to load: {indexState.error}</span>}
            {indexState.status === 'ready' && stats && (
              <span>
                {stats.chunks} passages · {stats.documents} documents · {modeLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            className="rag-link-button"
            onClick={() => setShowSettings((v) => !v)}
          >
            {showSettings ? 'Hide settings' : 'Settings'}
          </button>
        </div>

        {embedState.status === 'loading' && embedState.message && (
          <div className="rag-note">{embedState.message} The search already works without it.</div>
        )}
        {embedState.status === 'unavailable' && (
          <div className="rag-note rag-note-warn">{embedState.message}</div>
        )}

        {showSettings && (
          <div className="rag-settings">
            <div className="rag-setting-block">
              <h4>Written answers (optional)</h4>
              <p className="rag-setting-help">
                Retrieval runs locally and needs nothing from you. Paste your own API key and the
                retrieved passages are also sent to that provider to be written up as a cited
                answer. The key goes straight from your browser to the provider, stays in this tab
                only, and disappears when you close it.
              </p>
              <div className="rag-setting-row">
                <select
                  value={provider}
                  onChange={(event) => {
                    setProvider(event.target.value);
                    writeSession(PROVIDER_STORAGE, event.target.value);
                  }}
                  aria-label="Model provider"
                >
                  {Object.entries(PROVIDERS).map(([id, info]) => (
                    <option key={id} value={id}>{info.label} · {info.model}</option>
                  ))}
                </select>
                <input
                  type="password"
                  className="rag-key-input"
                  placeholder={`${PROVIDERS[provider].keyPrefix}…`}
                  value={apiKey}
                  autoComplete="off"
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    writeSession(KEY_STORAGE, event.target.value);
                  }}
                  aria-label="API key"
                />
                {apiKey && (
                  <button
                    type="button"
                    className="rag-link-button"
                    onClick={() => { setApiKey(''); writeSession(KEY_STORAGE, ''); }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="rag-setting-help">
                Get a key from{' '}
                <a href={PROVIDERS[provider].keyUrl} target="_blank" rel="noopener noreferrer">
                  {PROVIDERS[provider].label}
                </a>. Each question costs a fraction of a cent.
              </p>
            </div>

            <div className="rag-setting-block">
              <h4>Search in</h4>
              <p className="rag-setting-help">
                {documents.length - excluded.size} of {documents.length} articles included.
                Narrowing the scope is a good way to see the search working: ask about braking
                with only the frame articles selected and it returns nothing, instead of
                dressing up the nearest frame passage as an answer.
              </p>
              <div className="rag-doc-controls">
                <input
                  type="text"
                  className="rag-doc-filter"
                  value={docQuery}
                  placeholder="Filter articles by title…"
                  onChange={(event) => setDocQuery(event.target.value)}
                  aria-label="Filter articles by title"
                />
                <button
                  type="button"
                  className="rag-link-button"
                  onClick={() => setExcluded(new Set())}
                >
                  All
                </button>
                <button
                  type="button"
                  className="rag-link-button"
                  onClick={() => setExcluded(new Set(documents.map((d) => d.id)))}
                >
                  None
                </button>
              </div>
              <div className="rag-doc-toggles">
                {visibleDocuments.map((doc) => (
                  <label key={doc.id} className="rag-doc-toggle">
                    <input
                      type="checkbox"
                      checked={!excluded.has(doc.id)}
                      onChange={() => toggleDocument(doc.id)}
                    />
                    <span>{doc.title}</span>
                  </label>
                ))}
                {visibleDocuments.length === 0 && (
                  <p className="rag-setting-help">No article title contains that.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="rag-transcript" ref={transcriptRef}>
          {messages.length === 0 && (
            <div className="rag-empty">
              <p>Ask anything about bicycles: how they are built, how they handle, how they are raced.</p>
              <div className="rag-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rag-suggestion"
                    disabled={indexState.status !== 'ready'}
                    onClick={() => ask(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            message.role === 'user' ? (
              <div key={message.id} className="rag-turn rag-turn-user">
                <p>{message.text}</p>
              </div>
            ) : (
              <div key={message.id} className="rag-turn rag-turn-assistant">
                {message.stage === 'retrieving' && <p className="rag-thinking">Searching the articles…</p>}

                {message.empty && (
                  <p className="rag-thinking">
                    Nothing in the indexed articles matches that. Try rephrasing, or ask about
                    components, frame design, handling, infrastructure or racing.
                  </p>
                )}

                {message.answer && (
                  <AnswerText
                    text={message.answer}
                    messageId={message.id}
                    sourceCount={message.sources.length}
                  />
                )}
                {message.stage === 'generating' && (
                  <p className="rag-thinking">Writing an answer from {message.sources.length} passages…</p>
                )}
                {message.answerError && (
                  <p className="rag-error">Generation failed: {message.answerError} The passages below are still the retrieval result.</p>
                )}

                {message.confidence === 'weak' && message.sources.length > 0 && (
                  <p className="rag-weak-note">
                    Nothing in the articles matches this closely. Usually that means no single
                    passage answers the question, like &ldquo;which frame material is
                    best?&rdquo;, or it is about something these articles do not cover. Treat
                    these as a starting point rather than an answer.
                  </p>
                )}

                {message.sources.length > 0 && (
                  <>
                    <h4 className="rag-sources-heading">
                      {message.answer || message.stage === 'generating'
                        ? 'Sources'
                        : `Top ${message.sources.length} passages`}
                      {!message.hybrid && <span className="rag-mode-note"> · keyword search only</span>}
                      {message.confidence === 'weak' && <span className="rag-mode-note"> · weak match</span>}
                    </h4>
                    <ol className="rag-sources">
                      {message.sources.map((chunk, i) => (
                        <SourceCard
                          key={chunk.index}
                          chunk={chunk}
                          index={i}
                          query={message.query}
                          messageId={message.id}
                          expandedByDefault={false}
                        />
                      ))}
                    </ol>
                  </>
                )}
              </div>
            )
          ))}
        </div>

        <form
          className="rag-composer"
          onSubmit={(event) => { event.preventDefault(); ask(question); }}
        >
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={indexState.status === 'ready'
              ? 'Ask a question about bicycles…'
              : 'Loading the index…'}
            disabled={indexState.status !== 'ready' || busy}
            aria-label="Your question"
          />
          <button type="submit" disabled={indexState.status !== 'ready' || busy || !question.trim()}>
            {busy ? 'Searching…' : 'Ask'}
          </button>
        </form>
      </div>

      <div className="vertical-card">
        <div className="rag-prose">
          <h2>How it works</h2>
          <p>
            A retrieval system has two halves: the retriever finds the passages most likely
            to hold the answer, the generator writes them up. The retriever is the half that
            decides whether the answer is right, so this page shows its work.
          </p>

          <h3>How is the index built?</h3>
          <p>
            A script cuts each article into passages of about a thousand characters and
            embeds them with e5-small-v2. The vectors are squeezed to one byte per
            dimension, which turns 3,365 passages into 1.3 MB. Small enough to send to a
            browser.
          </p>

          <h3>Why that model?</h3>
          <p>
            I measured it. I wrote down a set of questions and the articles that answer
            them, then ran six models over it. The popular default came last. A model
            trained for retrieval beat a bigger one.
          </p>

          <h3>How does it search without a server?</h3>
          <p>
            The same model runs in your browser to embed your question and compares it
            against every stored passage. A keyword search runs next to it and the two
            rankings are merged. The semantic half handles paraphrase: a question about
            climbing rate in metres per hour finds an article called VAM, which shares no
            word with it. The keyword half catches rare strings like Presta or 700c, and
            keeps the page working if the model never loads.
          </p>

          <h3>What about the written answers?</h3>
          <p>
            Without an API key the page stops at retrieval and shows the passages with your
            terms highlighted. It cannot hallucinate, because every word on screen is copied
            from an article. Paste in your own key and the passages go to a model told to
            answer only from them and cite every claim.
          </p>

          <h3>What does it get wrong?</h3>
          <p>
            Tables and equations are not indexed, so a question whose answer is a number
            finds the discussion around it instead. It can only answer what a passage
            answers: &ldquo;Which frame material is best?&rdquo; has no paragraph stating a
            verdict, so the page says it is not confident rather than inventing one. And it
            is 255 articles, not all of cycling.
          </p>

          {stats?.attribution && (
            <>
              <h3>Attribution</h3>
              <p>
                The passages are text from {stats.attribution.source}
                {stats.attribution.fetched ? `, fetched on ${stats.attribution.fetched}` : ''}, used
                under{' '}
                {LICENCE_URLS[stats.attribution.license]
                  ? (
                    <a
                      href={LICENCE_URLS[stats.attribution.license]}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {stats.attribution.license}
                    </a>
                  )
                  : stats.attribution.license}. Every passage links back to the article it came
                from. The text ships inside the index rather than being fetched live, so this
                page redistributes it and that licence covers it. The code is my own.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default InteractiveRag;

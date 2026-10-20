import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './CommonStyles.css';
import './InteractiveRag.css';
import { loadIndex, retrieve, bestPassage, highlight, confidenceOf } from '../../../rag/retriever';
import { loadEmbedder } from '../../../rag/embedder';
import { synthesizeAnswer, PROVIDERS } from '../../../rag/synthesize';
import embeddingSpace from '../../../images/rag/embedding_space.jpg';

const SUGGESTIONS = [
  'How do graph convolutional networks make segmentation anatomically correct?',
  'What is gCNR and why use it for image quality?',
  'Can diffusion models generate realistic cardiac ultrasound?',
  'How is inter-model agreement used to predict quality?',
  'What are the limitations of nnU-Net here?',
  'Which datasets does this research use?',
];

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
  const pages = chunk.pageEnd > chunk.page ? `pp. ${chunk.page}–${chunk.pageEnd}` : `p. ${chunk.page}`;

  return (
    <li className="rag-source" id={`source-${messageId}-${index + 1}`}>
      <div className="rag-source-head">
        <span className="rag-source-number">{index + 1}</span>
        <div className="rag-source-meta">
          <span className="rag-source-title">
            {doc.url
              ? <a href={doc.url} target="_blank" rel="noopener noreferrer">{doc.title}</a>
              : doc.title}
          </span>
          <span className="rag-source-sub">
            {doc.venue}{doc.year ? `, ${doc.year}` : ''} · {pages}
            {chunk.section ? ` · ${chunk.section}` : ''}
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

  useEffect(() => {
    document.title = 'Ask my research · gillesvandevyver.com';
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

  const modeLabel = embedState.status === 'ready'
    ? 'Hybrid: embeddings + BM25'
    : embedState.status === 'loading'
      ? 'Keyword search (embeddings loading…)'
      : 'Keyword search (BM25)';

  return (
    <div className="project-page-container">
      <h1>Ask my research</h1>

      <div className="rag-hero">
        <img src={embeddingSpace} alt="" className="rag-hero-image" />
        <div className="rag-hero-text">
          <p>
            Every other page here tells you about my work. This one lets you interrogate it.
            Below is a retrieval-augmented generation system built over my published papers
            and PhD thesis: ask it a question and it searches the actual text, then shows you
            the passages it found and where they came from.
          </p>
          <p>
            The unusual part is that there is no backend. This site is static, so the entire
            retrieval pipeline runs inside your browser tab: the index is downloaded once,
            the question is embedded locally, and the search happens on your own machine.
            Nothing you type is sent to a server of mine, because there is no server of mine.
          </p>
          <p className="rag-hero-caption">
            The image is the index itself: all {stats?.chunks ?? '390-odd'} indexed passages
            projected from 384 dimensions down to two, coloured by source document.
            Passages about the same topic land near each other, which is exactly the property
            the retriever exploits.
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
                Retrieval runs locally and needs nothing from you. If you paste your own API key,
                the retrieved passages are additionally sent to that provider to be written up as
                a cited answer. The key goes from your browser straight to the provider, is kept
                only in this tab, and disappears when you close it.
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
              <div className="rag-doc-toggles">
                {documents.map((doc) => (
                  <label key={doc.id} className="rag-doc-toggle">
                    <input
                      type="checkbox"
                      checked={!excluded.has(doc.id)}
                      onChange={() => toggleDocument(doc.id)}
                    />
                    <span>{doc.title}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="rag-transcript" ref={transcriptRef}>
          {messages.length === 0 && (
            <div className="rag-empty">
              <p>Ask anything about the segmentation, image-quality or generative-model work.</p>
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
                {message.stage === 'retrieving' && <p className="rag-thinking">Searching the papers…</p>}

                {message.empty && (
                  <p className="rag-thinking">
                    Nothing in the indexed documents matches that. Try rephrasing, or ask about
                    segmentation, image quality, diffusion models or the clinical measurements.
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
                    Nothing in the papers matches this closely. That usually means the
                    question is about the body of work as a whole — &ldquo;which model is
                    used most often?&rdquo; — rather than about something any single
                    passage states. Search can only show you passages, so treat these as
                    a starting point rather than an answer.
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
              ? 'Ask a question about the papers…'
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
            A retrieval-augmented system has two halves. The retriever finds the handful of
            passages most likely to contain the answer; the generator turns those passages into
            prose. The retriever is the half that determines whether the answer is right, so it
            is the half this page puts on display: every answer shows the passages behind it,
            which document and page each came from, and how it was found.
          </p>

          <h3>Building the index</h3>
          <p>
            Two build scripts turn the PDFs into something searchable. The first extracts the
            text, repairs the damage that PDF extraction always does — hyphens splitting words
            across lines, ligatures, running headers repeated on every page — and discards the
            reference lists, which otherwise flood the index with the titles of other people's
            papers. What remains is cut into overlapping passages of roughly a thousand
            characters, each tagged with its document, page and section.
          </p>
          <p>
            The second script embeds each passage with a MiniLM sentence transformer and writes
            the vectors out as a quantised binary. The vectors are unit length, so every
            component falls in a known range and can be stored as a single byte instead of four
            floats. That turns the index into a file small enough to simply download.
          </p>

          <h3>Searching without a server</h3>
          <p>
            When you ask a question, the same MiniLM model runs in your browser to embed it, and
            the result is compared against every stored passage. Running alongside that is a
            BM25 keyword search, built in the browser from the passage text when the page loads.
          </p>
          <p>
            Both halves are necessary. Embeddings are good at paraphrase: ask about "making
            segmentation anatomically plausible" and they find the right passages even though the
            papers say "anatomical correctness". They are noticeably worse at exact technical
            tokens — a query for gCNR or nnU-Net returns loosely related material, because those
            strings barely registered during the model's training. Keyword search has exactly the
            opposite profile. The two rankings are merged with reciprocal rank fusion, which
            combines positions rather than scores and so needs no calibration between a bounded
            cosine similarity and an unbounded BM25 score.
          </p>
          <p>
            One corpus-specific problem remains. My thesis reproduces three of the papers as
            chapters, and one paper exists as both a published version and a longer preprint, so
            a naive index would answer every question with four copies of the same paragraph.
            The build script indexes only the thesis chapters that are not reproductions, and the
            retriever discards passages whose character trigrams overlap too heavily with one
            already selected, noting instead that the text appears in more than one place.
          </p>

          <h3>The generation step</h3>
          <p>
            Without an API key the page stops at retrieval, highlights your query terms and shows
            the most relevant sentences in each passage. This is deliberately the default: it
            works for everyone, costs nothing, and cannot hallucinate, because every word on
            screen is lifted verbatim from a paper. If you supply a key in the settings, the
            retrieved passages are sent to that provider with instructions to answer only from
            them and to cite each claim, and the citation markers in the answer link back to the
            passage they came from.
          </p>

          <h3>What this costs the visitor</h3>
          <p>
            The index is about 600 kB and loads with the page. The embedding model is a further
            25 MB, fetched in the background from a CDN and cached by the browser afterwards.
            The page is usable in keyword-only mode from the moment the index arrives and
            upgrades itself to hybrid search when the model finishes loading, so the download
            never blocks anything. If it fails altogether — an old browser, a blocked CDN — the
            keyword half carries on alone.
          </p>

          <h3>Honest limitations</h3>
          <p>
            Figures, tables and equations are dropped during extraction, so questions whose
            answers live in a results table will find the surrounding discussion rather than the
            numbers themselves. MiniLM truncates long passages, so the tail of a very long
            paragraph contributes less to its vector than the head. And the corpus is only my own
            work: ask about something I have not published on and the honest answer, which the
            system will give, is that it found nothing relevant.
          </p>
        </div>
      </div>
    </div>
  );
};

export default InteractiveRag;

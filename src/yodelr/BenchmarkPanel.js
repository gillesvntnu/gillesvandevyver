/* The Timing tab.
 *
 * Everything else on this page is live: you press a button, Python runs, you
 * see what it returned. This tab is the one exception, and it says so, because
 * the numbers it shows cannot be produced in a browser tab. benchmark.py runs
 * for minutes, holds 157 MB, disables the garbage collector to keep the tail
 * clean, and resolves a 254 ns add_user — none of which Pyodide can do, and
 * the last one not even natively without subtracting the clock's own cost.
 *
 * So they were measured once on a laptop and shipped. The raw stdout of that
 * run is committed next to the JSON and linked below, so every number here can
 * be checked against the thing it was parsed from.
 *
 * Both charts are hand-drawn SVG rather than a charting library. Two reasons:
 * the bundle is already large enough, and both axes here need to be
 * logarithmic over five decades, which is exactly the case where a library's
 * defaults fight you.
 */

import React, { useEffect, useState } from 'react';

const BENCHMARK_URL = `${process.env.PUBLIC_URL}/yodelr/benchmark.json`;
const CAPTURE_URL = `${process.env.PUBLIC_URL}/yodelr/benchmark.txt`;

/* Same three-way split benchmark.py's own _unit() uses, so a number here reads
 * identically to the same number in the committed capture. */
function formatNs(ns) {
  if (ns < 1e3) return `${ns.toFixed(0)} ns`;
  if (ns < 1e6) return `${(ns / 1e3).toFixed(2)} µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(2)} ms`;
  return `${(ns / 1e9).toFixed(2)} s`;
}

function compact(n) {
  if (n >= 1e6) return `${n / 1e6}M`;
  if (n >= 1e3) return `${n / 1e3}k`;
  return String(n);
}

/* ── Latency ─────────────────────────────────────────────────────────── */

/* 100 ns to 200 ms. The span is the point: the fastest operation and the
 * slowest are six decades apart, which no linear axis can show at once —
 * add_user would be a bar a third of a pixel wide. */
const LO = 1e2;
const HI = 2e8;
const DECADES = [1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];

const PLOT_X0 = 246;
const PLOT_X1 = 620;
const VALUE_X = PLOT_X1 + 14;
const NOTE_X = PLOT_X1 + 82;
/* Wide enough for the longest trailing note the report produces
   ("~189,480 posts in window"), which would otherwise be clipped by the
   viewBox rather than wrapped. */
const CHART_W = 840;
const ROW_H = 21;
const HEAD_H = 25;

function xOf(ns) {
  const clamped = Math.min(Math.max(ns, LO), HI);
  const t = (Math.log10(clamped) - Math.log10(LO)) / (Math.log10(HI) - Math.log10(LO));
  return PLOT_X0 + t * (PLOT_X1 - PLOT_X0);
}

/* Exported so the two charts can be rendered and rasterised outside a browser
   when checking that nothing overlaps or falls off the edge. */
export function LatencyChart({ groups }) {
  /* Lay the rows out first so the SVG height is known before anything is
     drawn, rather than guessed and then clipped. */
  const laid = [];
  let y = 34;
  groups.forEach(([title, rows]) => {
    laid.push({ kind: 'head', title, y });
    y += HEAD_H;
    rows.forEach((row) => {
      laid.push({ kind: 'row', row, y });
      y += ROW_H;
    });
    y += 6;
  });
  const height = y + 4;

  return (
    <svg
      className="yo-chart"
      viewBox={`0 0 ${CHART_W} ${height}`}
      role="img"
      aria-label="How long one call takes, on a logarithmic axis from 100 nanoseconds to 200 milliseconds. Writes and ordinary reads land in microseconds; delete_user and whole-corpus trending land in tens of milliseconds."
    >
      {/* Decade gridlines, drawn once behind everything. */}
      {DECADES.map((d) => (
        <g key={d}>
          <line
            x1={xOf(d)} x2={xOf(d)} y1={26} y2={height - 4}
            className="yo-grid"
          />
          <text x={xOf(d)} y={18} className="yo-axis" textAnchor="middle">
            {formatNs(d).replace('.00', '')}
          </text>
        </g>
      ))}

      {/* The number column needs saying: without it a reader has to guess
          which of the four statistics in the tooltip it is. */}
      <text x={VALUE_X} y={18} className="yo-axis">median</text>

      {laid.map((item) => {
        if (item.kind === 'head') {
          return (
            <text key={`h-${item.title}`} x={0} y={item.y + 12} className="yo-chart-head">
              {item.title}
            </text>
          );
        }
        const { row } = item;
        const mid = item.y + ROW_H / 2;
        const start = xOf(row.medianNs);
        const end = xOf(row.p99Ns);
        return (
          <g key={row.label} className={row.detail ? 'yo-series-detail' : undefined}>
            <title>
              {`${row.label} — median ${formatNs(row.medianNs)}, mean ${formatNs(row.meanNs)}, `
               + `p95 ${formatNs(row.p95Ns)}, p99 ${formatNs(row.p99Ns)}, `
               + `max ${formatNs(row.maxNs)} over ${row.count.toLocaleString('en-US')} calls`}
            </title>
            <text
              x={row.detail ? 238 : 230}
              y={mid + 3.5}
              className={`yo-chart-label${row.detail ? ' yo-chart-label-detail' : ''}`}
              textAnchor="end"
            >
              {row.display}
            </text>
            {/* The bar is the spread from the median to the p99, not a single
                average: an average hides the slow calls, and the slow calls
                are the ones anybody notices. The tick is the mean, which on
                these distributions often sits outside the bar — that gap is
                the long tail, and it is worth seeing rather than smoothing. */}
            <rect
              x={start}
              y={mid - 4.5}
              width={Math.max(end - start, 1.5)}
              height={9}
              rx={2}
              className={row.detail ? 'yo-bar-detail' : 'yo-bar-main'}
            />
            <line
              x1={xOf(row.meanNs)} x2={xOf(row.meanNs)}
              y1={mid - 7} y2={mid + 7}
              className="yo-bar-mean"
            />
            <text x={VALUE_X} y={mid + 3.5} className="yo-chart-value">
              {formatNs(row.medianNs)}
            </text>
            <text x={NOTE_X} y={mid + 3.5} className="yo-chart-note">
              {/* benchmark.py writes "#fb -- 483 posts" because its output is
                  a terminal. Here an en dash is just the same note, set. */}
              {row.note.replace(' -- ', ' — ')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Scaling ─────────────────────────────────────────────────────────── */

const SERIES = [
  ['addPostNs', 'add_post', 'yo-line-a'],
  ['trendingDayNs', 'get_trending_topics, 1-day window', 'yo-line-b'],
  ['deleteUserNs', 'delete_user', 'yo-line-c'],
];

const S_X0 = 64;
const S_X1 = 700;
const S_Y0 = 28;
const S_Y1 = 236;
const S_DECADES = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8];

export function ScalingChart({ rows }) {
  const xs = rows.map((r) => r.posts);
  const lx0 = Math.log10(Math.min(...xs));
  const lx1 = Math.log10(Math.max(...xs));
  const ly0 = Math.log10(1e3);
  const ly1 = Math.log10(1e8);

  const px = (posts) => S_X0 + ((Math.log10(posts) - lx0) / (lx1 - lx0)) * (S_X1 - S_X0);
  const py = (ns) => S_Y1 - ((Math.log10(ns) - ly0) / (ly1 - ly0)) * (S_Y1 - S_Y0);

  /* On log-log axes a straight line is a power law and its slope is the
     exponent, so "costs twice as much when the data doubles" is literally a
     45-degree line. Drawing one lets you read each series against O(n) by
     eye instead of doing arithmetic on the table. */
  const first = rows[0];
  const guide = [
    [px(first.posts), py(first.deleteUserNs)],
    [px(rows[rows.length - 1].posts),
      py(first.deleteUserNs * (rows[rows.length - 1].posts / first.posts))],
  ];

  return (
    <svg
      className="yo-chart"
      viewBox={`0 0 ${CHART_W} 286`}
      role="img"
      aria-label="Cost per call against dataset size, both axes logarithmic. Over a sixteen-fold increase in posts, add_post grows 1.2 times, the one-day trending window 7.6 times, and delete_user 11.8 times — the last tracking the dashed linear reference."
    >
      <text x={0} y={12} className="yo-axis">time per call</text>

      {S_DECADES.map((d) => (
        <g key={d}>
          <line x1={S_X0} x2={S_X1} y1={py(d)} y2={py(d)} className="yo-grid" />
          <text x={S_X0 - 8} y={py(d) + 3.5} className="yo-axis" textAnchor="end">
            {formatNs(d).replace('.00', '')}
          </text>
        </g>
      ))}

      {rows.map((r) => (
        <text key={r.posts} x={px(r.posts)} y={S_Y1 + 18} className="yo-axis" textAnchor="middle">
          {compact(r.posts)}
        </text>
      ))}
      <text x={(S_X0 + S_X1) / 2} y={S_Y1 + 36} className="yo-axis" textAnchor="middle">
        posts in the system
      </text>

      <line
        x1={guide[0][0]} y1={guide[0][1]} x2={guide[1][0]} y2={guide[1][1]}
        className="yo-guide"
      />
      <text x={guide[1][0] - 6} y={guide[1][1] - 8} className="yo-guide-label" textAnchor="end">
        linear — O(n)
      </text>

      {SERIES.map(([key, label, cls]) => (
        <g key={key}>
          <polyline
            className={`yo-line ${cls}`}
            points={rows.map((r) => `${px(r.posts)},${py(r[key])}`).join(' ')}
          />
          {rows.map((r) => (
            <circle key={r.posts} cx={px(r.posts)} cy={py(r[key])} r={3} className={`yo-dot ${cls}`}>
              <title>{`${label} at ${r.posts.toLocaleString('en-US')} posts: ${formatNs(r[key])}`}</title>
            </circle>
          ))}
          <text
            x={S_X1 + 8}
            y={py(rows[rows.length - 1][key]) + 3.5}
            className={`yo-line-label ${cls}`}
          >
            {key === 'trendingDayNs' ? 'trending/day' : label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ── The tab ─────────────────────────────────────────────────────────── */

export default function BenchmarkPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(BENCHMARK_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((json) => { if (!cancelled) setData(json); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="vertical-card">
        <h2>Timing</h2>
        <p className="yo-empty-note">The benchmark results could not be loaded ({error}).</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="vertical-card">
        <h2>Timing</h2>
        <p className="yo-empty-note">Loading the benchmark results…</p>
      </div>
    );
  }

  /* The report indents two rows because they are the worst case of the row
     above rather than separate operations. Keep that: "random topics costs
     1.5 µs" and "the biggest topic costs 42 µs" only mean something together. */
  const label = (row) => {
    if (row.label === 'busiest user') return '↳ busiest user';
    if (row.label === 'hottest topic') return '↳ hottest topic';
    return row.label;
  };
  const prep = (rows) => rows.map((r) => ({ ...r, display: label(r) }));

  const growth = (key) => {
    const a = data.scaling[0];
    const b = data.scaling[data.scaling.length - 1];
    return (b[key] / a[key]).toFixed(1);
  };
  const sizeGrowth = Math.round(
    data.scaling[data.scaling.length - 1].posts / data.scaling[0].posts,
  );

  const c = data.corpus;
  /* By label, not by index: the parser preserves benchmark.py's own order, and
     adding a row there should not silently repoint the sentence below. */
  const hour = data.reads.find((r) => r.label.includes('1 hour'));

  return (
    <div className="yo-timing" role="tabpanel" id="yo-panel-timing" aria-labelledby="yo-tab-timing">
      <div className="vertical-card">
        <h2>How long each call takes</h2>
        <p className="yo-timing-intro">
          These are the only numbers on this page that your browser did not just produce.
          They come from <code>benchmark.py</code> in the challenge repo, run natively on{' '}
          {c.posts.toLocaleString('en-US')} real tweets — {Math.round(c.users).toLocaleString('en-US')}{' '}
          users and {Math.round(c.distinct_topics).toLocaleString('en-US')} topics. It has to be
          native: resolving a {formatNs(data.writes[0].medianNs)} call means subtracting the
          clock's own {data.clockOverheadNs} ns cost and pausing the garbage collector, and
          WebAssembly gives you neither. The{' '}
          <a href={CAPTURE_URL} target="_blank" rel="noreferrer">raw output of that run</a>{' '}
          is committed beside the page; every number below is parsed from it rather than
          typed in.
        </p>

        <div className="yo-legend">
          <span className="yo-legend-item">
            <svg width="26" height="11" aria-hidden="true">
              <rect x="0" y="1" width="26" height="9" rx="2" className="yo-bar-main" />
            </svg>
            median to p99
          </span>
          <span className="yo-legend-item">
            <svg width="10" height="15" aria-hidden="true">
              <line x1="5" y1="0" x2="5" y2="15" className="yo-bar-mean" />
            </svg>
            mean
          </span>
        </div>

        <LatencyChart
          groups={[
            ['Writes', prep(data.writes)],
            ['Reads', prep(data.reads)],
            ['Deletes', prep(data.deletes)],
          ]}
        />

        {hour && (
          <p className="yo-timing-note">
            Read the gap between the tick and the bar. For a one-hour trending window the
            median call takes {formatNs(hour.medianNs)} and the mean takes{' '}
            {formatNs(hour.meanNs)} — {Math.round(hour.meanNs / hour.medianNs)} times more —
            because most of the 200 windows landed on a quiet stretch of 2009 and a few
            landed on a busy one. The cost follows how many posts fall inside the window,
            not how many exist, which is why the trending rows climb while nothing else
            does. The post counts in grey are worth reading with that in mind: each one is
            measured from a single sampled window rather than averaged, which is why two of
            them say roughly nothing was in there. That is the variance, not a mistake.
          </p>
        )}
      </div>

      <div className="vertical-card">
        <h2>What happens as the data grows</h2>
        <p className="yo-timing-intro">
          The same three measurements repeated at growing sizes. This is the part that
          actually checks the complexity table in <code>yodelr.py</code>, because a single
          measurement can only tell you that something is fast today.
        </p>

        <ScalingChart rows={data.scaling} />

        <div className="yo-growth">
          {SERIES.map(([key, name, cls]) => (
            <div className="yo-growth-item" key={key}>
              <span className={`yo-growth-swatch ${cls}`} aria-hidden="true" />
              <span className="yo-growth-value">×{growth(key)}</span>
              <span className="yo-growth-label">
                <code>{name.split(',')[0]}</code>
                {name.includes(',') && <>, 1-day window</>}
              </span>
            </div>
          ))}
        </div>

        <p className="yo-timing-note">
          Over a {sizeGrowth}× increase in posts, <code>add_post</code> got{' '}
          {growth('addPostNs')}× slower and <code>delete_user</code> got{' '}
          {growth('deleteUserNs')}× slower. That is the trade the implementation makes on
          purpose: three indexes kept in sorted order so that every read is already in the
          order it needs to be, paid for by a timeline rebuild on delete that costs the same
          whether the user wrote one post or a thousand. Trending sits in between at{' '}
          {growth('trendingDayNs')}× — the window is still a fixed day, but a day of a
          denser feed holds more posts to scan.
        </p>
      </div>

      <div className="vertical-card">
        <h2>What it costs to hold</h2>
        <div className="yo-memory">
          <div className="yo-memory-item">
            <span className="yo-memory-value">{data.memory.bytesPerPost.toFixed(0)}</span>
            <span className="yo-memory-label">bytes per post, all three indexes</span>
          </div>
          <div className="yo-memory-item">
            <span className="yo-memory-value">{data.memory.heldMb.toFixed(1)} MB</span>
            <span className="yo-memory-label">
              for {Math.round(data.memory.posts).toLocaleString('en-US')} posts
            </span>
          </div>
          <div className="yo-memory-item">
            <span className="yo-memory-value">
              {Math.round(data.memory.topicIndexEntries).toLocaleString('en-US')}
            </span>
            <span className="yo-memory-label">entries in the topic index</span>
          </div>
        </div>
        <p className="yo-timing-note">
          The topic index holds one entry per (post, topic) pair rather than per post, so it
          grows with how heavily people tag rather than with how much they write. On this
          corpus that is cheap — only {c.posts_with_topics_pct}% of 2009 tweets carry a
          hashtag at all.
        </p>
      </div>
    </div>
  );
}

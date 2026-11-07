/* The Timing tab: two charts, one sentence each saying where the data came from.
 *
 * Everything else on this page is live — you press a button, Python runs, you
 * see what it returned. This tab is the one exception, because the numbers it
 * shows cannot be produced in a browser tab. benchmark.py runs for minutes,
 * holds 589 MB, disables the garbage collector to keep the tail clean, and
 * resolves a 293 ns add_user — none of which Pyodide can do, and the last one
 * not even natively without subtracting the clock's own cost. So they were
 * measured once on a laptop and shipped.
 *
 * public/yodelr/benchmark.txt is that run's verbatim stdout, committed beside
 * the JSON, and every number drawn here was parsed out of it by
 * scripts/build_yodelr_benchmark.py rather than typed. The JSON is a superset
 * of what the chart uses: it also carries the scaling sweep and the memory
 * figures, which this tab used to draw and no longer does. They stay in the
 * capture and in the parser because they are measurements, and losing them to
 * a layout decision would be the wrong trade.
 *
 * The chart is hand-drawn SVG rather than a charting library. Two reasons: the
 * bundle is already large enough, and the axis needs to be logarithmic over six
 * decades, which is exactly the case where a library's defaults fight you.
 *
 * Two captures, because there are two implementations, and the second card is
 * only meaningful if the pair is comparable. Both were therefore measured on
 * the same machine in the same sitting: a 30% faster laptop would swamp a
 * genuine difference, and the reader has no way to tell the two apart by
 * looking. Each chart scales its own axis, so the same bar length in the two
 * cards does not mean the same duration -- the axis labels are what to read.
 */

import React, { useEffect, useState } from 'react';

const BENCHMARK_URLS = {
  v1: `${process.env.PUBLIC_URL}/yodelr/benchmark.json`,
  v2: `${process.env.PUBLIC_URL}/yodelr/benchmark_v2.json`,
};

/* Same three-way split benchmark.py's own _unit() uses, so a number here reads
 * identically to the same number in the committed capture. */
function formatNs(ns) {
  if (ns < 1e3) return `${ns.toFixed(0)} ns`;
  if (ns < 1e6) return `${(ns / 1e3).toFixed(2)} µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(2)} ms`;
  return `${(ns / 1e9).toFixed(2)} s`;
}

/* ── Latency ─────────────────────────────────────────────────────────── */

/* The axis spans whatever the data spans, rounded out to whole decades. It
 * used to be hardcoded at 100 ns–200 ms, which was right for the 400k capture
 * and quietly wrong for anything slower: xOf() clamps, so a 450 ms call would
 * have been drawn pinned to the right edge and read as 200 ms. A chart that
 * silently relabels its own data is worse than one that looks cramped, so the
 * range is derived instead. Rerun benchmark.py on a bigger corpus and the axis
 * grows a decade rather than lying.
 *
 * The span is the point, either way: the fastest operation and the slowest are
 * six decades apart, which no linear axis can show at once — add_user would be
 * a bar a third of a pixel wide. */
function decadesFor(values) {
  const usable = values.filter((v) => typeof v === 'number' && v > 0);
  /* Round the bottom down to a decade so the first gridline is a labelled
     one, but stop the top at the data itself rather than at the next decade.
     Rounding both ends out is tidier arithmetic and a worse chart: a slowest
     call of 119 ms would push the axis to a full second and spend a sixth of
     the width on emptiness. A little headroom keeps the longest bar off the
     edge. */
  const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...usable))));
  const hi = Math.max(...usable) * 1.08;
  const ticks = [];
  for (let d = lo; d <= hi; d *= 10) ticks.push(d);
  return { lo, hi, ticks };
}

const PLOT_X0 = 246;
const PLOT_X1 = 620;
const VALUE_X = PLOT_X1 + 14;
/* Just past the median column. There used to be a third column out here for
   the report's trailing notes ("#followfriday -- 2100 posts"), and the viewBox
   was 880 to hold the longest of them. With that column gone the extra 180
   units would be blank margin, and because the chart scales to its container,
   blank margin is paid for in smaller text everywhere else. */
const CHART_W = 700;
const ROW_H = 21;
const HEAD_H = 25;

/* Exported so the chart can be rendered and rasterised outside a browser when
   checking that nothing overlaps or falls off the edge. */
export function LatencyChart({ groups }) {
  /* Every drawn quantity, so nothing can fall outside the axis: the bars run
     median to p99 and the tick is the mean, and all three have to fit. */
  const all = [];
  groups.forEach(([, rows]) => rows.forEach((r) => {
    all.push(r.medianNs, r.meanNs, r.p99Ns);
  }));
  const { lo, hi, ticks } = decadesFor(all);
  const span = Math.log10(hi) - Math.log10(lo);
  const xOf = (ns) => {
    const clamped = Math.min(Math.max(ns, lo), hi);
    return PLOT_X0 + ((Math.log10(clamped) - Math.log10(lo)) / span) * (PLOT_X1 - PLOT_X0);
  };

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
      aria-label={`How long one call takes, on a logarithmic axis from ${formatNs(lo)} to ${formatNs(hi)}. Writes and ordinary reads land in microseconds; delete_user and whole-corpus trending land in tens of milliseconds.`}
    >
      {/* Decade gridlines, drawn once behind everything. */}
      {ticks.map((d) => (
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
          </g>
        );
      })}
    </svg>
  );
}

/* ── The tab ─────────────────────────────────────────────────────────── */

/* The report indents two rows because they are the worst case of the row above
   rather than separate operations. Keep that: "random topics costs 1.5 µs" and
   "the biggest topic costs 42 µs" only mean something together. */
function label(row) {
  if (row.label === 'busiest user') return '↳ busiest user';
  if (row.label === 'hottest topic') return '↳ hottest topic';
  return row.label;
}
const prep = (rows) => rows.map((r) => ({ ...r, display: label(r) }));

/* One capture, drawn. Both cards are the same component because they are the
   same measurement of two objects; if they diverged into two bodies of JSX,
   a change to one chart would silently stop applying to the other. */
function TimingCard({ title, intro, data }) {
  return (
    <div className="vertical-card">
      <h2>{title}</h2>
      <p className="yo-timing-intro">{intro}</p>
      <LatencyChart
        groups={[
          ['Writes', prep(data.writes)],
          ['Reads', prep(data.reads)],
          ['Deletes', prep(data.deletes)],
        ]}
      />
    </div>
  );
}

export default function BenchmarkPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      ['v1', 'v2'].map((key) => fetch(BENCHMARK_URLS[key]).then((r) => {
        if (!r.ok) throw new Error(`${key}: ${r.status} ${r.statusText}`);
        return r.json();
      })),
    )
      .then(([v1, v2]) => { if (!cancelled) setData({ v1, v2 }); })
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

  const c = data.v1.corpus;
  const n = (value) => Math.round(value).toLocaleString('en-US');
  const dataset = c.datasetUrl
    ? <a href={c.datasetUrl} target="_blank" rel="noreferrer">{c.datasetName || 'Sentiment140'}</a>
    : (c.datasetName || 'Sentiment140');

  return (
    <div className="yo-timing" role="tabpanel" id="yo-panel-timing" aria-labelledby="yo-tab-timing">
      <TimingCard
        title="Timing"
        data={data.v1}
        intro={(
          <>
            The timings below come from {n(c.posts)} real tweets, {n(c.users)} users
            and {n(c.distinct_topics)} topics. It is the public {dataset} dataset.
          </>
        )}
      />
      <TimingCard
        title="Timing v2"
        data={data.v2}
        intro={(
          <>
            The same calls, against a revision that keeps a second timeline of
            only the posts carrying a topic and counts those into hourly
            buckets. Same tweets, same machine.
          </>
        )}
      />
    </div>
  );
}

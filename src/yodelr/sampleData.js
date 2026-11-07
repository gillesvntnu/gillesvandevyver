/* Canned data for the playground.
 *
 * Two sets. The walkthrough is the example from the challenge spec, small
 * enough to check by eye. The sample is a few hundred posts built to make the
 * interesting operations do something visible.
 */

export const MAX_POST_LENGTH = 140;

/* ── The spec's worked example ─────────────────────────────────────────
 * Straight from the Yodelr API spec. Ends with trending(1, 3) returning
 * ["steak", "chilling"]: steak is in two posts, chilling in one.
 */
export const WALKTHROUGH = {
  users: ['john'],
  posts: [
    ['john', 'just #chilling today', 1],
    ['john', 'eating #steak for dinner', 2],
    ['john', 'ugh! this #steak tasted like dog food', 3],
  ],
};

/* ── A few hundred posts ───────────────────────────────────────────────
 *
 * Deterministic, so the page behaves the same on every visit and the hints
 * about what to try stay true.
 *
 * Shaped rather than uniform, because uniform data makes every query look the
 * same. Three things are deliberately skewed:
 *
 *   Topics follow roughly 1/rank. The head topics appear in hundreds of posts
 *   and the tail in one or two, so the trending table has an actual shape and
 *   the alphabetical tiebreak among the tail is visible.
 *
 *   Posting is skewed too: a handful of users write most of the posts. That is
 *   what makes delete_user worth watching, since deleting a heavy poster
 *   visibly reshuffles the trending table instead of nudging it. One user is
 *   additionally given a topic nobody else uses much, so deleting them makes a
 *   topic drop out of the table altogether rather than merely slip a place —
 *   the clearest way to see that delete_user really does rip posts out of the
 *   topic index and not just the user's own list.
 *
 *   Topics come in and out of fashion over the timeline, so a trending window
 *   over the first third returns a different answer than one over the last.
 */

/** mulberry32: small, fast, seeded. Same sequence everywhere, forever. */
function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const USERS = [
  'ada', 'bjorn', 'chiara', 'dmitri', 'elin', 'farid', 'greta', 'hassan',
  'ingrid', 'jonas', 'kasia', 'lars', 'mei', 'nikolai', 'olga', 'pedro',
  'quinn', 'rahel', 'sofie', 'tariq', 'ulrike', 'viktor', 'wanda', 'yusuf',
];

/* Topic pools by era. Each post draws from the era its timestamp falls in,
 * with the head of the list drawn far more often than the tail. */
const EARLY = [
  'coffee', 'commute', 'rain', 'deadline', 'standup', 'bugfix', 'monday',
  'sourdough', 'cat', 'trainticket',
];
const MIDDLE = [
  'coffee', 'release', 'latency', 'benchmark', 'rewrite', 'oncall', 'pager',
  'cycling', 'fjord', 'sunburn', 'tent', 'puncture',
];
const LATE = [
  'cycling', 'winter', 'snow', 'skis', 'darkness', 'glogg', 'release',
  'postmortem', 'retro', 'coffee', 'cabin', 'firewood', 'northern_lights',
];

/* One user, one obsession. Most of bjorn's posts are about his starter, and
 * almost nobody else mentions it, so #sourdough sits high in the all-time
 * table and vanishes from it the moment bjorn is deleted. */
const OBSESSIVE_USER = 'bjorn';
const OBSESSION = 'sourdough';
const OBSESSION_RATE = 0.62;

/* Sentence frames. %T is replaced by a hashtag, so topic placement varies and
 * the parser gets topics at the start, middle and end of the text. */
const FRAMES = [
  'another morning of %T and not much else',
  '%T again. third time this week',
  'somebody please explain %T to me',
  'finally fixed the %T thing, only took all day',
  'does anyone else find %T strangely calming',
  'two hours of %T and I regret nothing',
  'hot take: %T is underrated',
  'spent the whole evening on %T, worth it',
  '%T and %T in the same day, what a combination',
  'cannot stop thinking about %T',
  'okay %T is officially out of control now',
  'quiet day. just %T.',
  'update on the %T situation: still ongoing',
  'my entire personality is %T at this point',
  'pretty happy with how %T turned out, see %T',
];

/** Draw an index with weight ~1/(rank+1): head-heavy, long tail. */
function zipfIndex(random, length) {
  const weights = [];
  let total = 0;
  for (let i = 0; i < length; i += 1) {
    const w = 1 / (i + 1);
    weights.push(w);
    total += w;
  }
  let roll = random() * total;
  for (let i = 0; i < length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return length - 1;
}

function buildSample() {
  const random = makeRandom(20240219);
  const posts = [];

  const POST_COUNT = 320;
  let timestamp = 1000;

  for (let i = 0; i < POST_COUNT; i += 1) {
    // Strictly increasing, with uneven gaps so time windows are not uniform.
    timestamp += 1 + Math.floor(random() * 90);

    // Heavy posters: the Zipf draw over users means ada and bjorn write far
    // more than yusuf, which is what makes deleting one of them interesting.
    const user = USERS[zipfIndex(random, USERS.length)];

    const progress = i / POST_COUNT;
    const pool = progress < 0.33 ? EARLY : progress < 0.66 ? MIDDLE : LATE;

    const frame = FRAMES[Math.floor(random() * FRAMES.length)];
    const obsessed = user === OBSESSIVE_USER;
    let text = frame.replace(/%T/g, () => (
      obsessed && random() < OBSESSION_RATE
        ? `#${OBSESSION}`
        : `#${pool[zipfIndex(random, pool.length)]}`
    ));

    // About one post in seven carries no topic at all, so the timeline and the
    // topic index visibly hold different numbers.
    if (random() < 0.14) text = text.replace(/#/g, '');

    // The implementation rejects anything over the limit. The frames are far
    // shorter than that, but generated text should never be able to break the
    // page, so it is enforced here rather than hoped for.
    if (text.length > MAX_POST_LENGTH) text = text.slice(0, MAX_POST_LENGTH);

    posts.push([user, text, timestamp]);
  }

  return { users: [...USERS], posts };
}

export const SAMPLE = buildSample();

/** Window covering everything in the sample, for the trending defaults. */
export const SAMPLE_RANGE = {
  from: SAMPLE.posts[0][2],
  to: SAMPLE.posts[SAMPLE.posts.length - 1][2],
};

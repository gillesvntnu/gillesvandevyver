"""Yodelr v2: the same answers as v1, with get_trending_topics made faster.

v1 is unchanged and still the submitted implementation. This file exists to
answer one question that came out of benchmarking it: trending is the only
operation whose cost grows with the size of the window, and on 1.6 million
posts a whole-corpus query takes 436 ms. Where does that time go, and what
is the cheapest honest way to get it back?

Nothing here is imported from a copy. Post, MAX_POST_LENGTH and the topic
pattern all come from yodelr.py itself, so if the rule for what counts as a
topic ever changes, v2 follows it instead of quietly disagreeing.


What v1 does
------------
It binary-searches the timeline for the window, then counts the topics of
every post inside it:

    for post in self._timeline[lo:hi]:
        counts.update(post.topics)

That is O(w) in the posts inside the window, which is already the obvious
thing to do. Two measurements say it is leaving a lot on the table.


Change 1: a timeline of only the posts that carry a topic
---------------------------------------------------------
On the Sentiment140 corpus 2.24% of posts contain a hashtag. The other
97.76% go through the loop above, hit `counts.update(frozenset())`, and
contribute nothing. v1 spends roughly 44 iterations of pure overhead for
every iteration that does work.

So v2 keeps a second timeline, _tagged, holding only the posts whose topics
are non-empty, with _tagged_ts beside it for the binary search. Trending
reads that one. The answer cannot change: a post with no topics cannot
affect a count of topics.

This is only a constant factor -- still O(w) -- but the constant is the
reciprocal of how many posts are tagged, and that was worth 30x on a
week-long window.


Change 2: hourly buckets of pre-counted topics
----------------------------------------------
_buckets maps an hour to a Counter of the topics mentioned in it. A window
covering whole hours can add those Counters together instead of revisiting
the posts, which replaces w post-visits with (hours x topics-per-hour)
Counter merges.

The two partial hours at the ends do not line up with the window, so those
are still walked post by post -- out of _tagged, so change 1 helps there
too. That edge cost is the floor on this whole idea and the reason the
bucket width matters.

Why an hour, and not a day or a minute? The cost of a query is

    (W / B) * k(B)        merging the whole buckets inside the window
  + rho * B               walking the two partial buckets at the ends

for window W, bucket width B, arrival rate rho, and k(B) distinct topics in
a bucket. The first term falls as B grows and the second rises, so there is
a minimum rather than a matter of taste. Measured on this corpus, k follows
Heaps' law at k = 0.097 * B**0.738, which puts the optimum at roughly
W**0.78 -- it depends on the query. Timing it across widths from one minute
to one week showed a shallow bowl: anything from 15 minutes to 6 hours lands
within about 20% of the best, and an hour sits in the middle of that
plateau for every window size tested. So an hour is not optimal for any
particular query, it is the width that is never badly wrong.

The parameter-free version of this is a hierarchy of resolutions -- hourly
and daily and weekly counts, a segment tree over time -- which is optimal
for every W at once. That is a bigger change than this file is for.


What v2 does NOT change
-----------------------
The full _timeline stays, even though trending no longer reads it. Two
reasons. A social system needs "every post in time order" even though this
particular API has no method that asks for it, and keeping it means v2 and
v1 do the same work on delete_user, so a benchmark comparing them is
measuring trending rather than a difference in what got thrown away.

Dropping it would be a real win -- delete_user rebuilds the timeline, which
is its O(n) term, and rebuilding only _tagged would be about 44x less work
on this data. That is a separate change with a separate trade-off, so it is
not bundled in here.


Cost
----
n = all posts, w = posts in the window, g = tagged posts in the window,
B = non-empty hourly buckets in the window, k = topics per bucket,
u = one user's posts, t = topics on one post.

    add_user             O(1)                      unchanged
    add_post             O(t)                      one Counter bump per topic
    delete_user          O(u * t + n)              unchanged, timeline rebuild
    get_posts_for_user   O(u)                      unchanged
    get_posts_for_topic  O(p)                      unchanged
    get_trending_topics  O(log n + B * k + edges + k log k)

where `edges` is the tagged posts in the two partial hours, and v1's
equivalent term was the whole of w.
"""

from bisect import bisect_left, bisect_right
from collections import Counter, OrderedDict
from typing import Dict, List

# The interface and the shared vocabulary come from the submitted file, not
# from a second copy of them. This is the same rule the website build follows
# for yodelr.py: one source, imported, never retyped.
from yodelr import MAX_POST_LENGTH, Post, Yodelr, _TOPIC_RE

#: Width of one pre-counted bucket, in seconds. See the note above on why an
#: hour: the cost curve is flat between about 15 minutes and 6 hours, and an
#: hour is the width that is never badly wrong for any window size.
BUCKET_SECONDS = 3600


class YodelrV2(Yodelr):
    """In-memory Yodelr with pre-counted hourly topic buckets."""

    def __init__(self) -> None:
        # --- the three indexes v1 has, unchanged -----------------------
        self._posts_by_user: Dict[str, List[Post]] = {}
        self._posts_by_topic: Dict[str, OrderedDict] = {}
        self._timeline: List[Post] = []
        self._timeline_ts: List[int] = []
        self._last_timestamp = None  # type: ignore[var-annotated]

        # --- what v2 adds ---------------------------------------------
        # Only the posts that actually carry a topic, oldest first, with
        # their timestamps alongside for binary search. Trending reads
        # these two and never touches _timeline.
        self._tagged: List[Post] = []
        self._tagged_ts: List[int] = []

        # hour -> Counter(topic -> how many posts in that hour mention it).
        # One post counts once per topic however often it hashtags it,
        # because post.topics is a frozenset.
        self._buckets: Dict[int, Counter] = {}

        # The occupied hours, ascending. Kept so a wide window can jump
        # straight to the buckets that exist instead of walking every hour
        # between its two ends -- a query spanning a year would otherwise
        # probe 8,760 mostly-absent keys. Timestamps only ever increase, so
        # a new hour is always later than every hour already here and this
        # stays sorted by appending.
        self._bucket_keys: List[int] = []

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _hour_of(timestamp: int) -> int:
        """Which bucket a timestamp falls in.

        Anchored to absolute time rather than to the first post, so the
        bucket a post belongs to never changes. Anchoring to the first
        timestamp would re-number every bucket the moment delete_user
        removed the oldest post.

        Python's // rounds towards minus infinity, so negative timestamps
        bucket consistently too: -1 // 3600 == -1, and bucket -1 covers
        -3600 to -1.
        """
        return timestamp // BUCKET_SECONDS

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------

    def add_user(self, user_name: str) -> None:
        """Register a new user. O(1). Identical to v1."""
        if not user_name:
            raise ValueError("user name must be a non-empty string")
        if user_name in self._posts_by_user:
            raise ValueError("user already exists: {!r}".format(user_name))
        self._posts_by_user[user_name] = []

    def add_post(self, user_name: str, post_text: str, timestamp: int) -> None:
        """Store one post and file it in every index. O(t).

        The three validity checks and their messages are v1's, because a
        caller switching implementations should not have to catch different
        errors. What is new is the last block: a tagged post also goes into
        _tagged and bumps its hour's Counter.
        """
        posts = self._posts_by_user.get(user_name)
        if posts is None:
            raise ValueError("unknown user: {!r}".format(user_name))
        if len(post_text) > MAX_POST_LENGTH:
            raise ValueError(
                "post exceeds {} characters: {}".format(
                    MAX_POST_LENGTH, len(post_text)
                )
            )
        if self._last_timestamp is not None and timestamp <= self._last_timestamp:
            raise ValueError(
                "timestamps must strictly increase: got {}, last was {}".format(
                    timestamp, self._last_timestamp
                )
            )

        post = Post(
            timestamp=timestamp,
            user_name=user_name,
            text=post_text,
            topics=frozenset(_TOPIC_RE.findall(post_text)),
        )

        posts.append(post)
        self._timeline.append(post)
        self._timeline_ts.append(timestamp)
        self._last_timestamp = timestamp

        for topic in post.topics:
            bucket = self._posts_by_topic.get(topic)
            if bucket is None:
                bucket = self._posts_by_topic[topic] = OrderedDict()
            bucket[timestamp] = post

        # Everything below here is what v2 adds. An untagged post stops at
        # the line above: it is in the timeline and in its author's list,
        # and it is invisible to trending because it has nothing to count.
        if not post.topics:
            return

        self._tagged.append(post)
        self._tagged_ts.append(timestamp)

        hour = self._hour_of(timestamp)
        counts = self._buckets.get(hour)
        if counts is None:
            counts = self._buckets[hour] = Counter()
            # Append, do not insort: timestamps strictly increase, so this
            # hour is at or after every hour already recorded, and it is
            # only new if it is strictly after.
            self._bucket_keys.append(hour)
        counts.update(post.topics)

    def delete_user(self, user_name: str) -> None:
        """Remove a user and every post they wrote. O(u * t + n).

        The bucket Counters are decremented rather than rebuilt. Each post
        remembers its own topics and its own timestamp, which is enough to
        find the exact entries to undo, so this costs O(u * t) and not a
        pass over the data.

        A Counter that reaches zero for a topic has that topic removed
        instead of left at 0. Leaving zeros would be invisible in the
        counting -- adding 0 changes nothing -- but get_trending_topics
        sorts the keys of the merged Counter, so a stale zero would appear
        in the result as a topic nobody has mentioned.
        """
        try:
            posts = self._posts_by_user.pop(user_name)
        except KeyError:
            raise ValueError("unknown user: {!r}".format(user_name))

        for post in posts:
            for topic in post.topics:
                bucket = self._posts_by_topic.get(topic)
                if bucket is None:
                    continue
                bucket.pop(post.timestamp, None)
                if not bucket:  # nobody mentions this topic any more
                    del self._posts_by_topic[topic]

            if not post.topics:
                continue

            hour = self._hour_of(post.timestamp)
            counts = self._buckets.get(hour)
            if counts is None:
                continue
            for topic in post.topics:
                remaining = counts[topic] - 1
                if remaining > 0:
                    counts[topic] = remaining
                else:
                    del counts[topic]
            if not counts:
                del self._buckets[hour]
                # _bucket_keys is sorted, so find the hour rather than scan.
                at = bisect_left(self._bucket_keys, hour)
                if at < len(self._bucket_keys) and self._bucket_keys[at] == hour:
                    self._bucket_keys.pop(at)

        if posts:
            self._timeline = [p for p in self._timeline if p.user_name != user_name]
            self._timeline_ts = [p.timestamp for p in self._timeline]
            # Filtered, not rebuilt from _posts_by_user: filtering keeps the
            # existing order, so nothing has to be sorted, and it costs the
            # length of the tagged timeline rather than of all posts.
            self._tagged = [p for p in self._tagged if p.user_name != user_name]
            self._tagged_ts = [p.timestamp for p in self._tagged]

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_posts_for_user(self, user_name: str) -> List[str]:
        """That user's posts, newest first. O(u). Identical to v1."""
        posts = self._posts_by_user.get(user_name)
        if posts is None:
            raise ValueError("unknown user: {!r}".format(user_name))
        return [post.text for post in reversed(posts)]

    def get_posts_for_topic(self, topic: str) -> List[str]:
        """Posts mentioning a topic, newest first. O(p). Identical to v1."""
        bucket = self._posts_by_topic.get(topic)
        if bucket is None:
            return []
        return [post.text for post in reversed(list(bucket.values()))]

    def _count_tagged_between(self, counts: Counter, lo_ts: int, hi_ts: int) -> None:
        """Add the topics of every tagged post in an inclusive range.

        This is v1's loop, narrowed to the posts that can contribute. It is
        used for the two partial hours at the ends of a window, and for a
        window that sits inside a single hour.
        """
        if lo_ts > hi_ts:
            return
        lo = bisect_left(self._tagged_ts, lo_ts)
        hi = bisect_right(self._tagged_ts, hi_ts)
        for post in self._tagged[lo:hi]:
            counts.update(post.topics)

    def get_trending_topics(self, from_timestamp: int, to_timestamp: int) -> List[str]:
        """Topics mentioned in a time window, most mentioned first.

        Both ends are included, each post counts once per topic, and ties
        are broken alphabetically -- all exactly as v1, which is checked by
        a differential test rather than by assertion.

        The window is split into at most three pieces: a partial first hour,
        a run of whole hours, and a partial last hour. Only the whole hours
        can use the pre-counted buckets, because only they are entirely
        inside the window.
        """
        if from_timestamp > to_timestamp:
            raise ValueError(
                "empty interval: from {} > to {}".format(from_timestamp, to_timestamp)
            )

        counts = Counter()  # type: Counter

        first_hour = self._hour_of(from_timestamp)
        last_hour = self._hour_of(to_timestamp)

        if first_hour == last_hour:
            # Entirely inside one hour, so the bucket is no use: it counts
            # the whole hour and the window is only part of it.
            self._count_tagged_between(counts, from_timestamp, to_timestamp)
        else:
            # The hours strictly between the two ends are fully covered, so
            # their pre-counted totals can be added as they are. Walk the
            # occupied hours, not every hour in the range.
            start = bisect_right(self._bucket_keys, first_hour)
            stop = bisect_left(self._bucket_keys, last_hour)
            buckets = self._buckets
            for hour in self._bucket_keys[start:stop]:
                counts.update(buckets[hour])

            # The two ends, post by post.
            self._count_tagged_between(
                counts, from_timestamp, (first_hour + 1) * BUCKET_SECONDS - 1
            )
            self._count_tagged_between(
                counts, last_hour * BUCKET_SECONDS, to_timestamp
            )

        # Most mentions first, ties broken alphabetically. Same key as v1.
        return sorted(counts, key=lambda topic: (-counts[topic], topic))

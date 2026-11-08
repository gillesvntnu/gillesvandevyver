from abc import ABC, abstractmethod
from bisect import bisect_left, bisect_right
from collections import Counter, OrderedDict
from typing import Dict, FrozenSet, List, NamedTuple
import re


class Yodelr(ABC):
    """Provided interface -- unchanged."""

    @abstractmethod
    def add_user(self, user_name: str) -> None:
        pass

    @abstractmethod
    def add_post(self, user_name: str, post_text: str, timestamp: int) -> None:
        pass

    @abstractmethod
    def delete_user(self, user_name: str) -> None:
        pass

    @abstractmethod
    def get_posts_for_user(self, user_name: str) -> List[str]:
        pass

    @abstractmethod
    def get_posts_for_topic(self, topic: str) -> List[str]:
        pass

    @abstractmethod
    def get_trending_topics(self, from_timestamp: int, to_timestamp: int) -> List[str]:
        pass


# ======================================================================
# Implementation
# ======================================================================
#
# The trick the whole design rests on: timestamps always go up and are never
# reused. So anything we append to is already in time order -- we never sort
# on insert -- and a timestamp doubles as a unique id for a post.
#
# Each post is written down once as a Post object. Three indexes point at
# that same object, one per question the API can ask:
#
#   _posts_by_user   name -> that user's posts, oldest first.
#                    Doubles as the list of registered users.
#
#   _posts_by_topic  topic -> {timestamp: post}, oldest first.
#                    Keyed by timestamp, not a plain list, so removing one
#                    post is instant instead of searching a huge topic.
#
#   _timeline        every post, oldest first, plus _timeline_ts holding
#                    just the timestamps. Trending has to binary-search for
#                    where a time window starts and ends, and only a list
#                    lets you jump straight to position N.
#
# Reading is fast because each index already holds its answer in the right
# order. Deleting is where the work happens.
#
# Cost of each operation. n = all posts, u = one user's posts, p = one
# topic's posts, w = posts inside the asked-for window, k = different
# topics in that window:
#
#   add_user             O(1)
#   add_post             O(1)      -- the 140-char limit caps the work
#   delete_user          O(u) + O(n) to rebuild the timeline
#   get_posts_for_user   O(u)      -- that is the size of the answer, so
#   get_posts_for_topic  O(p)         these two cannot be beaten
#   get_trending_topics  O(log n + w + k log k)
#
# delete_user rebuilds the timeline from scratch, which is the O(n) part.
# The alternative is to leave dead posts in place and skip them while
# reading: instant deletes, but trending gets slower and slower until you
# clean up. Deleting a user is rare and trending is the common case, so we
# pay on delete and keep every read as fast as it can be.
#
# If trending ever became the bottleneck, in order of effort: cache repeated
# windows; or switch strategy for wide windows (the binary search already
# tells us the window size for free); or precompute counts in a tree over
# time. None of that is worth it at this size.


MAX_POST_LENGTH = 140

# A topic is '#' followed by one or more of [0-9a-zA-Z_].
# Spelled out instead of the shorter \w because \w also matches accented and
# non-Latin letters, which would wrongly let "#café" through.
_TOPIC_RE = re.compile(r"#([0-9a-zA-Z_]+)")


class Post(NamedTuple):
    """One post, stored once and shared by all three indexes.

    A NamedTuple because it cannot be changed after creation (so sharing it
    around is safe) and it is cheaper in memory than a normal object.

    topics is a set, so "#a #a" counts as one mention of "a".

    We keep the author's name as text rather than a link back to a user
    object. That keeps the references one-way, so posts are freed the moment
    nothing points at them.
    """

    timestamp: int
    user_name: str
    text: str
    topics: FrozenSet[str]


class YodelrImpl(Yodelr):
    """In-memory Yodelr. Single-threaded, as the spec allows."""

    def __init__(self) -> None:
        # name -> that user's posts, oldest first
        self._posts_by_user: Dict[str, List[Post]] = {}
        # topic -> {timestamp: post}, oldest first
        self._posts_by_topic: Dict[str, OrderedDict] = {}
        # every post, oldest first, plus the same timestamps on their own
        self._timeline: List[Post] = []
        self._timeline_ts: List[int] = []
        # Highest timestamp ever accepted. Kept separately from the timeline
        # because deleting a user can remove the newest post, and a timestamp
        # that has already been used must never be accepted a second time.
        self._last_timestamp = None  # type: ignore[var-annotated]

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------

    def add_user(self, user_name: str) -> None:
        """Register a new user. O(1).

        Raises if the name is taken. Quietly doing nothing would hide a bug
        in the caller, and quietly starting over would throw away that
        user's posts -- so the caller gets to decide.
        """
        if not user_name:
            raise ValueError("user name must be a non-empty string")
        if user_name in self._posts_by_user:
            raise ValueError("user already exists: {!r}".format(user_name))
        self._posts_by_user[user_name] = []

    def add_post(self, user_name: str, post_text: str, timestamp: int) -> None:
        """Store one post and file it in every index. O(1).

        The spec promises the timestamps behave, but we check anyway: a bad
        timestamp would quietly break the time ordering that every read
        depends on, and that is much harder to debug later than failing here.
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

        # Appending keeps all three in time order, because timestamps only
        # ever go up. Nothing is sorted here.
        posts.append(post)
        self._timeline.append(post)
        self._timeline_ts.append(timestamp)
        self._last_timestamp = timestamp

        for topic in post.topics:
            bucket = self._posts_by_topic.get(topic)
            if bucket is None:
                bucket = self._posts_by_topic[topic] = OrderedDict()
            bucket[timestamp] = post

    def delete_user(self, user_name: str) -> None:
        """Remove a user and every post they wrote. O(u) + O(n).

        Each post remembers its own topics, and each topic is keyed by
        timestamp, so we delete exactly the right entries without ever
        searching through a topic. Rebuilding the timeline is the O(n) part.
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

        if posts:
            self._timeline = [p for p in self._timeline if p.user_name != user_name]
            self._timeline_ts = [p.timestamp for p in self._timeline]

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_posts_for_user(self, user_name: str) -> List[str]:
        """That user's posts, newest first. O(u).

        The stored list is oldest first, so we walk it backwards. No sorting.
        """
        posts = self._posts_by_user.get(user_name)
        if posts is None:
            raise ValueError("unknown user: {!r}".format(user_name))
        return [post.text for post in reversed(posts)]

    def get_posts_for_topic(self, topic: str) -> List[str]:
        """Posts mentioning a topic, newest first. O(p).

        An unknown topic gives an empty list rather than an error: topics
        are never registered, they appear and disappear with the posts.
        """
        bucket = self._posts_by_topic.get(topic)
        if bucket is None:
            return []
        # Copy to a list before reversing, because older Pythons cannot
        # reverse a dictionary view directly. Costs O(p), the same as the
        # answer we are about to return anyway.
        return [post.text for post in reversed(list(bucket.values()))]

    def get_trending_topics(self, from_timestamp: int, to_timestamp: int) -> List[str]:
        """Topics mentioned in a time window, most mentioned first.

        O(log n + w + k log k): find the window, count inside it, sort.
        Both ends of the window are included.
        """
        if from_timestamp > to_timestamp:
            raise ValueError(
                "empty interval: from {} > to {}".format(from_timestamp, to_timestamp)
            )

        # The timeline is in time order, so instead of checking every post we
        # binary-search for where the window starts and ends. Using "left" for
        # the start and "right" for the end is what includes both ends.
        lo = bisect_left(self._timeline_ts, from_timestamp)
        hi = bisect_right(self._timeline_ts, to_timestamp)

        counts = Counter()  # type: Counter
        for post in self._timeline[lo:hi]:
            counts.update(post.topics)  # a set, so one post is one vote

        # Most mentions first, ties broken alphabetically. The minus sign
        # flips the count to descending while the name stays ascending.
        # Example: steak=2, apple=1, mango=1  ->  steak, apple, mango.
        #
        # Counter.most_common() looks right for this but is not: it makes no
        # promise about the order of topics that tie.
        return sorted(counts, key=lambda topic: (-counts[topic], topic))

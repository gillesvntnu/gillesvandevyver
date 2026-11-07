/* The worked example from the Yodelr spec.
 *
 * Small enough to check by eye, which is the whole point of it: three posts
 * where you can count the topic mentions yourself and see that the
 * implementation agrees. Anything larger comes from the real tweet corpus on
 * the other tab rather than from generated data, so there is nothing else
 * here.
 *
 * Ends with get_trending_topics(1, 3) returning ["steak", "chilling"]:
 * steak is in two posts, chilling in one.
 */

export const WALKTHROUGH = {
  users: ['john'],
  posts: [
    ['john', 'just #chilling today', 1],
    ['john', 'eating #steak for dinner', 2],
    ['john', 'ugh! this #steak tasted like dog food', 3],
  ],
};

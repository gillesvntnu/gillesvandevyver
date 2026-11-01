#!/usr/bin/env bash
#
# Smoke tests: one query per feature the project page demonstrates.
#
#     ./vespa/scripts/queries.sh            # run them all
#     ./vespa/scripts/queries.sh 3          # run only number 3
#
# Each prints the YQL it is about to send, then the titles it got back, so the
# query and its result can be read together. Pipe to `less` if that scrolls.
#
# Requires jq for the pretty output. Without it, set RAW=1 to dump the JSON.
#
set -uo pipefail

ENDPOINT="${VESPA_ENDPOINT:-http://localhost:8080}"
ONLY="${1:-}"
RAW="${RAW:-0}"

if [ "$RAW" != "1" ] && ! command -v jq >/dev/null 2>&1; then
  echo "jq not found; falling back to raw JSON. Install jq, or set RAW=1 to silence this."
  RAW=1
fi

SUMMARY='doc_id, title, section, part, cluster_name, text'

# ---------------------------------------------------------------------------
# run <number> <heading> <explanation> <curl args...>
# ---------------------------------------------------------------------------
run() {
  local number="$1"; shift
  local heading="$1"; shift
  local explanation="$1"; shift

  if [ -n "$ONLY" ] && [ "$ONLY" != "$number" ]; then return 0; fi

  printf '\n\033[1;34m%s. %s\033[0m\n' "$number" "$heading"
  printf '   %s\n\n' "$explanation"

  for arg in "$@"; do
    case "$arg" in
      yql=*|ranking.profile=*|input.query*|query=*|hits=*|streaming.*=*)
        printf '   \033[2m%s\033[0m\n' "$arg" ;;
    esac
  done
  echo

  local response
  response="$(curl -fsS --get "${ENDPOINT}/search/" "${@/#/--data-urlencode=}" 2>&1)" || {
    printf '   \033[1;31mrequest failed\033[0m - is the cluster up? %s\n' "$ENDPOINT"
    return 1
  }

  if [ "$RAW" = "1" ]; then
    echo "$response"
    return 0
  fi

  # Grouping responses have no hits, so print whichever shape came back.
  if echo "$response" | jq -e '.root.children[]? | select(.id | startswith("group:"))' >/dev/null 2>&1; then
    echo "$response" | jq -r '
      [.. | objects | select(has("value") and (.fields? | has("count()")))]
      | .[] | "   \(.fields["count()"] | tostring | (" " * (6 - length)) + .)  \(.value)"'
  else
    echo "$response" | jq -r '
      .root.children[]?
      | "   \(.relevance | . * 10000 | round / 10000 | tostring | (. + "        ")[0:8])  "
        + "\(.fields.title)"
        + (if (.fields.section // "") == "" then "" else "  -  \(.fields.section)" end)'
  fi

  local timing
  timing="$(echo "$response" | jq -r '.timing.searchtime // empty')"
  [ -n "$timing" ] && printf '   \033[2m(%s s)\033[0m\n' "$timing"
}

echo "Querying $ENDPOINT"

# ---------------------------------------------------------------------------
run 1 "Keyword only (BM25)" \
  "'Presta' is a rare string. Keyword search is very good at rare strings." \
  "yql=select $SUMMARY from passage where userQuery()" \
  "query=presta valve" \
  "ranking.profile=keyword" \
  "hits=5"

# ---------------------------------------------------------------------------
run 2 "Vector only (approximate nearest neighbour)" \
  "This question shares no word with 'self-stability', the article that answers it.
   Keyword search cannot find it. The vector half can." \
  "yql=select $SUMMARY from passage where ({targetHits:100}nearestNeighbor(embedding, q))" \
  "input.query(q)=embed(e5, @query)" \
  "query=why does a moving bicycle stay upright on its own" \
  "ranking.profile=semantic" \
  "hits=5"

# ---------------------------------------------------------------------------
run 3 "Hybrid, fused in the global phase" \
  "Both retrievers run, and reciprocal rank fusion merges their two orderings
   on the container after the content nodes have reported in." \
  "yql=select $SUMMARY from passage where ({targetHits:100}nearestNeighbor(embedding, q)) or userQuery()" \
  "input.query(q)=embed(e5, @query)" \
  "query=what is trail in bicycle steering geometry" \
  "ranking.profile=hybrid" \
  "hits=5"

# ---------------------------------------------------------------------------
run 4 "ColBERT late interaction as a second phase" \
  "Same retrieval as 3, then the top 200 per node are rescored token by token.
   Slower than 3, and the timing below should show it." \
  "yql=select $SUMMARY from passage where ({targetHits:100}nearestNeighbor(embedding, q)) or userQuery()" \
  "input.query(q)=embed(e5, @query)" \
  "input.query(qt)=embed(colbert, @query)" \
  "query=how do rim brakes differ from disc brakes" \
  "ranking.profile=colbert" \
  "hits=5"

# ---------------------------------------------------------------------------
run 5 "Grouping: which semantic clusters answer this?" \
  "limit 0 asks for no hits at all, only the counts. One pass over the matches
   produces the whole breakdown." \
  "yql=select * from passage where userQuery() limit 0 | all(group(cluster_name) order(-count()) each(output(count())))" \
  "query=brakes" \
  "ranking.profile=keyword"

# ---------------------------------------------------------------------------
run 6 "Grouping: top articles, nested inside clusters" \
  "max(3) keeps it to three articles per cluster. Nesting is how a facet
   sidebar with drill-down gets built from a single request." \
  "yql=select * from passage where userQuery() limit 0 | all(group(cluster_name) order(-count()) each(group(title_facet) max(3) order(-count()) each(output(count()))))" \
  "query=gears" \
  "ranking.profile=keyword"

# ---------------------------------------------------------------------------
run 7 "Filtering: restrict the search before ranking it" \
  "The cluster filter is an attribute lookup, so the ranker never sees the
   passages it excludes. This is the scope control, pushed into the engine." \
  "yql=select $SUMMARY from passage where (({targetHits:100}nearestNeighbor(embedding, q)) or userQuery()) and cluster_name contains \"lean, steer, radius\"" \
  "input.query(q)=embed(e5, @query)" \
  "query=how does gearing work" \
  "ranking.profile=hybrid" \
  "hits=5"

# ---------------------------------------------------------------------------
run 8 "Filtering: an explicit allow-list of articles" \
  "'in' with a list of ids. This is what the article checkboxes on the page
   send, and why narrowing the scope makes a weak answer honestly empty
   instead of quietly worse." \
  "yql=select $SUMMARY from passage where (({targetHits:100}nearestNeighbor(embedding, q)) or userQuery()) and doc_id in (\"bicycle-frame\", \"bicycle-wheel\")" \
  "input.query(q)=embed(e5, @query)" \
  "query=how do disc brakes work" \
  "ranking.profile=hybrid" \
  "hits=5"

# ---------------------------------------------------------------------------
run 9 "Streaming mode: the same question inside one group" \
  "Different document type, different content cluster, same text. streaming.groupname
   names the group - here one article - and nothing outside it is read at all.
   No inverted index and no HNSW graph were built for this; the group is
   streamed and matched document by document." \
  "yql=select $SUMMARY from article_passage where userQuery()" \
  "streaming.groupname=bicycle-brake" \
  "query=how do disc brakes work" \
  "ranking.profile=keyword" \
  "hits=5"

# ---------------------------------------------------------------------------
run 10 "Streaming mode: nearest neighbour, exactly" \
  "Same operator as 2, and targetHits is accepted, but there is no graph to
   approximate with: every vector in the group is compared. At a few dozen
   passages that is cheaper than a graph would have been." \
  "yql=select $SUMMARY from article_passage where ({targetHits:20}nearestNeighbor(embedding, q))" \
  "streaming.groupname=bicycle-and-motorcycle-dynamics" \
  "input.query(q)=embed(e5, @query)" \
  "query=why does a moving bicycle stay upright on its own" \
  "ranking.profile=semantic" \
  "hits=5"

# ---------------------------------------------------------------------------
run 11 "Streaming mode: what a missing group looks like" \
  "A group that was never fed is not an error. It is zero documents, which is
   the correct answer to 'what is in this empty mailbox' and the thing a demo
   should show rather than hide." \
  "yql=select $SUMMARY from article_passage where userQuery()" \
  "streaming.groupname=no-such-article" \
  "query=brakes" \
  "ranking.profile=keyword" \
  "hits=5"

echo

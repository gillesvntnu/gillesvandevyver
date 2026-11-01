# The cycling corpus, in Vespa

This directory holds a [Vespa](https://vespa.ai) application that indexes the same
3,365 passages from 255 Wikipedia cycling articles that the in-browser search on
this site covers, and the scripts to get it running on a laptop. The page that
queries it lives at `/#/projects/vespa`.

It holds that corpus **twice**, in two content clusters, because Vespa has two
storage modes and the trade between them is easiest to believe when the same
question goes through both. `cycling-content` is indexed: inverted index, HNSW
graph, everything built at feed time. `cycling-streaming` is streaming: nothing
built at all, partitioned by article, scanned one article per query. The page has a
switch for it.

The in-browser version ships a 1.3 MB index and a 30 MB embedding model to the
tab and does the whole search there. This version does none of that. The browser
sends a question and gets passages back; the tokenising, embedding, nearest
neighbour lookup, BM25, fusion, late-interaction reranking and faceting all
happen in Vespa. The two sit side by side on the site on purpose — they answer
the same questions over the same text, and the difference is entirely in where
the work is done and what that buys.

There is no recorded fallback. If no cluster answers, the page says so and shows
you the command below. A search page that serves canned results when its engine
is down is lying about what it is.

## Running it

You need Docker, Python 3 and about 8 GB of memory free. Then, from the repository
root:

```
./vespa/scripts/run_local.sh
```

That script starts a Vespa container, fetches the Vespa CLI if you do not already
have one, deploys `vespa/app`, builds both feeds from `public/rag/corpus.json`, and
feeds both clusters. It is safe to re-run: redeploying is the normal way to apply a
schema change, and feeding again overwrites documents by id rather than
duplicating them.

Two steps are slow and only slow the first time. The first deploy downloads about
570 MB of ONNX models into the container. The feed then takes fifteen to forty
minutes on a laptop, because Vespa embeds every passage twice on the way in —
once with e5, once with ColBERT, both on CPU. Almost none of that is indexing. The
streaming feed afterwards is quicker, because that schema stores no ColBERT
vectors and so only pays for e5.

To skip the streaming half entirely:

```
./vespa/scripts/run_local.sh --no-streaming
```

Everything on the page still works; the mode switch reports that the streaming
cluster is empty.

For a quick trial, feed a slice instead of the whole corpus:

```
./vespa/scripts/run_local.sh --limit 200 --no-streaming
```

That is the two-minute version. A limited feed goes to its own file
(`feed-200.json`) so that it cannot be mistaken for the full corpus and reused on
a later run. The article list on the page stays at all 255 names either way — the
manifest is written whole regardless of `--limit` — so some of those checkboxes
will filter to nothing until the rest is fed.

Then start the site with `npm start` and open `/#/projects/vespa`. It defaults to
`http://localhost:8080`, so it should find the cluster without being told. To
check the cluster directly instead:

```
./vespa/scripts/queries.sh
```

Eleven queries covering each rank profile, the grouping expression, both kinds of
filter and the three streaming cases. Stop the cluster with
`docker stop vespa-cycling`.

## What is in here

```
app/
  services.xml                     two content clusters, two embedders
  schemas/passage.sd               indexed: fields, tensors, four rank profiles
  schemas/article_passage.sd       streaming: the same, minus the index structures
  search/query-profiles/default.xml  query defaults
scripts/
  make_feed.py                     corpus.json -> both feeds + article manifest
  run_local.sh                     one command from nothing to a fed cluster
  queries.sh                       smoke tests
FEATURES-EXPLAINED.md              what the interesting parts do, from scratch
```

`schemas/passage.sd` is the file worth reading. It defines four rank profiles —
`keyword`, `semantic`, `hybrid` and `colbert` — which is what the four buttons on
the page switch between. `schemas/article_passage.sd` is the streaming half, and
reads best as a diff against it: no HNSW block, no `fast-search`, no ColBERT field,
and a `rank-properties` block supplying the average field lengths that BM25 needs
and streaming mode cannot compute for itself. It offers three profiles rather than
four, because `second-phase` has no effect in streaming mode and the `colbert`
profile is nothing but a second phase. `FEATURES-EXPLAINED.md` walks through all of
it assuming no prior knowledge of search engines.

`make_feed.py` also writes `public/vespa/articles.json`, a 15 kB list of article
ids and titles that the page uses to draw its "search only in these articles"
checkboxes. The filtering itself is done by Vespa; only the list of names is
static, so that the control can be drawn before the cluster answers.

## Deploying somewhere other than a laptop

The application package works unchanged on [Vespa Cloud](https://cloud.vespa.ai),
with two edits.

First, add CORS, which `services.xml` deliberately does not configure. Locally it
is unnecessary — `npm start` proxies `/search/` through to port 8080, so the
browser only ever sees one origin — but a page served from somewhere else is a
cross-origin caller and will be refused at the preflight. The commented block at
the top of `services.xml` has the shape of the filter chain and the one thing to
check before trusting it: the mechanism for filters living in JDisc bundles is
`<filter-config>`, not `<config name="...">`. The latter is validated against a
config definition the config server does not ship, and the failure mode is a
deploy that hangs until the timeout rather than one that reports an error.

Second, add token authentication, because an open query endpoint on the public
internet is someone else's free compute:

```xml
<clients>
  <client id="browser" permissions="read">
    <token id="browser-token"/>
  </client>
</clients>
```

Create the token with `vespa auth token add browser-token`, then paste it into the
page's Settings panel along with the endpoint. It is sent as a bearer header.

Be clear-eyed about what that token is: anything a browser can send, a reader can
read. A token embedded in a page is public. `permissions="read"` is what makes
that acceptable — it can run queries and cannot write, delete or redeploy. If the
cluster held anything private, this whole arrangement would be the wrong shape,
and the query would need to go through a backend that holds the credential.

One operational wrinkle worth knowing before relying on it: Vespa Cloud's free
dev zone deletes deployments after 14 days without activity. A scheduled redeploy
keeps it alive, or accept that the page needs a `run_local.sh` to be interesting.

## Attribution

The passages are text from Wikipedia, used under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Every passage
carries the URL of the article it came from. The schema, scripts and page are
mine.

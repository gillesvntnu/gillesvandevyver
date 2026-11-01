# Four things a search engine does, explained from scratch

This is a companion to the page at `/#/projects/vespa`. It assumes you have never
configured a search engine and explains the four things this application does that
a `for` loop over an array could not: **hybrid retrieval with phased ranking**,
**ColBERT late interaction**, **grouping and faceting**, and **filtering at scale**.

Everything here is about the same small corpus: 255 Wikipedia articles about
bicycles, cut into 3,365 passages of roughly nine hundred characters each. Three
thousand of anything is nothing. The whole point of using a real search engine on
it is that the techniques below are the ones that still work at three billion, and
at three thousand you can actually watch them work.

---

## Part 0: what has to happen before any of this

Say you ask *"how do rim brakes differ from disc brakes?"*. Something has to turn
that sentence into a list of passages. There are two completely different ways to
do it, and they fail in opposite directions.

### The word way: an inverted index and BM25

The old way, and still the best way for a lot of queries, is to make a big lookup
table: for every word in the corpus, which passages contain it, and how often. That
table is called an **inverted index** — inverted because the obvious table goes
passage → words, and this one goes word → passages.

To answer a question you look up each of its words, collect the passages, and score
them. The standard scoring function is **BM25**, and the intuition behind it is
three rules that every reasonable person would invent on their own:

A passage that uses your word more times is more about your word — but with
diminishing returns, because the tenth "brake" tells you much less than the second.
A word that is rare across the whole corpus is worth more than a common one, so
"Presta" counts for far more than "the"; in this corpus "bicycle" is nearly as
useless as "the", because it is in almost everything. And a short passage that
mentions your word is more about it than a long passage that mentions it once, so
scores are adjusted for length.

BM25 is a formula that balances those three. It has no idea what any word *means*.
That is its great strength — it will find "Presta" or "700c" or "sheldon brown"
instantly and exactly, because those are strings and it matches strings — and its
fatal weakness. Ask *"why does a moving bicycle stay upright on its own?"* and BM25
cannot find the article called **Bicycle and motorcycle dynamics**, which answers
it under the heading "self-stability", because that passage shares no useful word
with your question at all.

In `passage.sd`, this is the entire configuration:

```
field text type string {
    indexing: index | summary
    index: enable-bm25
}
```

`index` says build the inverted index. `enable-bm25` says also keep the per-field
statistics BM25 needs. `summary` says you are allowed to ask for this field back in
results.

### The meaning way: embeddings and nearest neighbours

The other way is to turn text into numbers that capture meaning. A neural network
called an **embedding model** reads a passage and emits a list of 384 numbers — a
point in 384-dimensional space. It has been trained so that text with similar
meaning lands in similar places, regardless of vocabulary. "Stay upright on its
own" and "self-stability" land close together, because the model learned from a
very large amount of text that they are the same idea.

Now searching means: embed the question the same way, and find the passages whose
points are nearest to the question's point. Nearness is measured by **cosine
distance**, which compares the *direction* of the two points rather than their
length. Direction is what carries meaning; length tends to carry how emphatic or
how long the text was, which you do not want to rank on.

The model here is `e5-small-v2`. The configuration, in `services.xml`:

```xml
<component id="e5" type="hugging-face-embedder">
  <transformer-model url="https://huggingface.co/intfloat/e5-small-v2/resolve/main/model.onnx"/>
  <tokenizer-model url="https://huggingface.co/intfloat/e5-small-v2/raw/main/tokenizer.json"/>
  <prepend>
    <query>query:</query>
    <document>passage:</document>
  </prepend>
</component>
```

That `<prepend>` block is a real trap, worth a paragraph. The e5 family is
**asymmetric**: it was trained with the literal string `query:` glued to the front
of questions and `passage:` glued to the front of documents, and it genuinely needs
them. Leave them off and nothing errors — the search just quietly gets worse, which
is the most expensive kind of bug. Having Vespa apply both prefixes itself removes
the commonest version of this mistake, which is prefixing at indexing time and
forgetting at query time, six months apart, in two different codebases.

And then the field that uses it:

```
field embedding type tensor<bfloat16>(x[384]) {
    indexing: input title . ". " . input text | embed e5 | attribute | index
    attribute { distance-metric: angular }
    index { hnsw { max-links-per-node: 24  neighbors-to-explore-at-insert: 200 } }
}
```

Several things are happening in that one `indexing:` line, and they are worth
unpacking because it is the line that makes the browser page thin.

Nothing in the feed file supplies this field. The feed sends `title` and `text`;
Vespa glues them together, runs the embedding model over the result, and stores the
output. The vectors never cross the network, never get versioned, never get out of
sync with the model that made them — because the model that made them is the one
running in the cluster.

The title is glued on for a specific reason. A passage halfway through an article
often never names its own subject: a paragraph from "Bicycle brake" may talk about
"the pads" and "the rim" and never once say "brake". Embedded alone, that paragraph
drifts toward whatever it happens to discuss. Embedded with its title, it stays
anchored.

`bfloat16` stores each number in two bytes instead of four. At this scale that is a
rounding error in accuracy and half the memory, which is a trade worth taking every
time.

### Why HNSW, and what "approximate" costs

The `hnsw` block is the interesting part. Finding the nearest vector by brute force
means comparing the question against all 3,365 passages. That is trivial. At three
billion it is impossible, so you need an index — but unlike a word index, a vector
index cannot be exact and fast at the same time.

**HNSW** stands for Hierarchical Navigable Small World, and the idea is a road
network. When the corpus is built, each passage is linked to a couple of dozen
others that are near it, and a sparser layer of long-distance links is laid on top,
like motorways over local roads. To search, you drop into the top layer, take
whichever motorway heads toward your question, and when you can get no closer, drop
to the layer below and repeat on local roads. You arrive after visiting a few
hundred passages instead of all of them.

This is **approximate**. It is possible to get stuck in a neighbourhood and miss a
slightly better passage across town. `max-links-per-node: 24` and
`neighbors-to-explore-at-insert: 200` are the dials: more links and more exploration
means better roads, more memory, and slower indexing. The honest summary is that
you trade a small, tunable amount of recall for not doing all the work — a bad
trade at 3,365 passages and the only possible trade at three billion.

Vector search has the mirror-image weakness to BM25. Ask it for "Presta" and it
returns passages about valves in general, because to an embedding model a rare
proper noun is just an unfamiliar token near some other tokens. It cannot do
*exact*. BM25 can only do exact.

Which is the whole reason for part one.

---

## Part 1: hybrid retrieval and phased ranking

### Why not just add the scores?

The obvious way to combine two scores is to add them, with a weight:

```
score = 0.7 * cosine + 0.3 * bm25
```

This is a trap. Cosine similarity lives between −1 and 1 and always will. BM25 is
unbounded and depends on the corpus: it is built from how rare your words are and
how long the passages are, so a BM25 of 8 might be excellent in one corpus and
mediocre in another. The two numbers are not on the same scale, are not on the
*same kind of* scale, and the weight that balances them is a property of your
particular corpus on a particular day. Add a hundred articles and it is wrong again.
Teams spend a startling amount of time retuning that number.

### Reciprocal rank fusion

The alternative is to throw the scores away and keep only the **positions**. Rank
the passages by BM25 — first, second, third. Rank them again by cosine. A passage's
fused score is then

```
1 / (k + rank in the BM25 list)  +  1 / (k + rank in the cosine list)
```

summed over the lists it appears in, with `k` a damping constant (60 is the usual
default) that stops the first position from dominating everything.

That is **reciprocal rank fusion**, RRF. Positions are the only thing the two
rankings have in common, and they need no calibration, because "third" means the
same thing in both lists no matter what the corpus is. A passage that both methods
like comes top. A passage that one method loves and the other has never heard of
still does well, which is exactly what you want when one of your two retrievers is
the only one capable of finding a given answer.

In Vespa it is a built-in:

```
global-phase {
    expression: reciprocal_rank_fusion(bm25_score, vector_score)
    rerank-count: 200
}
```

### Phases, and why they are in different places

Here is the part that is specific to real search engines and tends to surprise
people coming from a notebook.

Ranking does not happen once. It happens in stages, and the stages run on different
machines, because the whole architecture is built around doing cheap work on many
documents and expensive work on few.

A Vespa cluster has **content nodes**, which hold documents, and **container
nodes**, which are stateless and talk to the outside world. A query fans out from a
container to every content node; each one searches its own share and sends back its
best; the container merges them into one answer.

**first-phase** runs on the content node, over every single document that matched.
In this corpus that might be a few thousand. In a real one it is millions. So it has
to be cheap — it is not trying to produce the final answer, it is only deciding who
survives to be looked at properly:

```
first-phase {
    expression: vector_score + 0.01 * bm25_score
}
```

The tiny BM25 term is a tie-breaker. In a corpus about one subject, a great many
passages have nearly identical cosine scores, and some signal is better than
arbitrary order for deciding who gets through.

**second-phase** also runs on the content node, but only over the top N of what
first-phase ranked, per node. This is where you put something expensive — see part
two.

**global-phase** runs on the container, once, after every content node has reported
in. It is the only place in the whole system where a document's position *relative
to the entire result set* is knowable, because until the merge happens, each node
only knows its own share.

That is why RRF has to go in global-phase. RRF consumes positions. A content node
holding one tenth of the corpus does not know a document's true position — it only
knows its position among that node's tenth. Putting RRF anywhere else would be
computing ranks from a shard, which is not the same number.

There is a bookkeeping detail: global-phase runs on a machine that does not hold the
documents, so any feature it wants has to be sent up from the content nodes along
with the hits. That is what the `match-features` block is for:

```
match-features {
    bm25_score
    vector_score
    bm25(text)
    closeness(field, embedding)
}
```

Those are also exactly the numbers the page puts in the little chips under each
result. They are not reconstructed in JavaScript; they are the values the ranker
computed, carried out in the response.

---

## Part 2: ColBERT and late interaction

### The problem with one vector per passage

Compressing nine hundred characters into 384 numbers loses information. It has to.
And the thing it loses most reliably is *which part of the passage matched*.

Take *"how do rim brakes differ from disc brakes?"*. That question has two subjects.
A passage entirely about rim brakes is a strong match to half of it and no match at
all to the other half — but averaged into a single vector, "strongly about half of
it" and "moderately about all of it" can come out looking the same. The single
vector has no way to express *coverage*.

### Keeping the tokens

**ColBERT** keeps one vector per token instead of one per passage. A 256-token
passage becomes 256 small vectors. The question becomes a handful more.

Scoring is called **MaxSim**, and the rule is small enough to state in a sentence:
for each word of the question, find the word of the passage that matches it best,
and add those bests up.

So "rim" finds the passage's best "rim"-ish token, "disc" finds its best "disc"-ish
token, "differ" finds whatever is closest to the idea of difference. A passage that
has something good for every query word scores higher than a passage that has
something spectacular for half of them and nothing for the rest. Coverage, which is
precisely what the single vector could not express.

"Late interaction" is the name for the timing. An ordinary cross-encoder reads the
question and the passage together and is enormously more accurate and enormously too
slow to run on a corpus, because nothing can be precomputed. ColBERT encodes the
passage alone, at indexing time, and the question alone, at query time, and lets
them interact only at the very end, in that cheap MaxSim arithmetic. You get a
chunk of the accuracy and keep the precomputation.

### Making it fit

The obvious objection is storage. 3,365 passages × 256 tokens × 128 dimensions ×
4 bytes is about 440 MB, for three thousand short passages. That does not scale.

Vespa's answer is to throw away almost all of each number and keep only its sign:

```
field colbert type tensor<int8>(dt{}, x[16]) {
    indexing: input text | embed colbert | attribute
    attribute: paged
}
```

`int8` and `x[16]` for a 128-dimensional model looks like a typo and is not. Each
dimension is stored as a single bit — positive or negative — so 128 dimensions pack
into 128 bits, which is 16 bytes. That is 32× smaller, and 440 MB becomes 14 MB.
Remarkably, it costs very little accuracy, because what MaxSim needs is a decent
ordering of candidates, and the pattern of signs across 128 dimensions turns out to
carry most of that.

`dt{}` is a **mapped** dimension — Vespa's name for a dimension whose size is not
fixed in advance. Passages have different numbers of tokens, so the token dimension
cannot be declared as a number the way `x[16]` is.

`paged` means these vectors live on disk and are faulted into memory when touched,
unlike a normal attribute which is pinned in RAM. That is the right trade here
because they are only read for the couple of hundred documents that reach reranking.
Pinning all of them would be paying full price for data you touch 6% of.

The scoring expression undoes the packing and then does the arithmetic:

```
function unpack() {
    expression: unpack_bits(attribute(colbert))
}

function max_sim() {
    expression {
        sum(reduce(sum(query(qt) * unpack(), x), max, dt), qt)
    }
}

second-phase {
    expression: max_sim
    rerank-count: 200
}
```

Read the inner expression from the inside out. `sum(query(qt) * unpack(), x)` is a
dot product over the dimension `x`, giving a similarity for every (query token,
document token) pair. `reduce(..., max, dt)` collapses the document-token dimension
by taking the maximum — for each query token, keep only its best match. `sum(...,
qt)` adds those bests across the query tokens. That is MaxSim, in one line, which is
either elegant or terrifying depending on how you feel about tensor notation.

### Why second-phase and not global-phase

This is the detail I would most want someone to take away. MaxSim needs
`attribute(colbert)`, and attributes live on the content nodes, next to the
documents. The stateless container does not have them and is not going to fetch
them. So MaxSim must run in **second-phase**, on the content nodes, while RRF in
part one must run in **global-phase**, on the container.

Neither placement is stylistic. Each computation has to run where its inputs are,
and in a distributed system the inputs are in different places. `rerank-count: 200`
then caps it at the top 200 per node, because running MaxSim over everything that
matched is the thing phased ranking exists to prevent. The page's "Compare all four"
button exists to show what that second phase costs in milliseconds.

---

## Part 3: grouping and faceting

**Faceting** is the row of counts down the side of every shopping site: *Brand:
Shimano (42), SRAM (31)*. The useful version has two properties that are easy to
get wrong. The counts must cover everything that matched, not just the page of
results you can see. And they must describe *the same matched set* that produced
those results, or clicking one gives you a different number of things than it
promised.

The tempting implementation — fetch the top 50, count what is in them — fails both.
It counts 50 things, not the 2,000 that matched, so the numbers are wrong, and they
are wrong in a way that looks plausible.

In Vespa, faceting is an expression appended to the query with a pipe, and Vespa
produces it from the same pass over the matched set that produced the ranking:

```
select … from passage where …
  | all(group(cluster_name) order(-count()) each(output(count())
      all(group(title_facet) max(5) order(-count()) each(output(count())))))
```

The grammar is a small language and reads oddly at first, but there are only a few
pieces. `group(field)` says what to split by. `each(...)` says what to do inside
every resulting bucket. `output(count())` says emit the size of the bucket.
`order(-count())` sorts buckets by size, descending. `max(5)` keeps only the five
biggest. Nesting an `all(group(...))` inside an `each(...)` groups again within each
bucket, which is what produces the indented article names under each cluster on the
page.

The counts come back with the hits, in one response, from one pass. The facet panel
and the ranked list are therefore describing the same thing by construction rather
than by promise.

### One requirement that trips people up

You cannot group on an indexed field. An index is tokenised and inverted — built for
asking "which documents contain this word" and structurally incapable of answering
"what is the exact value of this field for this document". Grouping needs the second
question. That needs an **attribute**: a column kept in memory, one value per
document, in document order.

Which is why the schema carries the article title twice:

```
field title type string {
    indexing: index | summary
    index: enable-bm25
}

field title_facet type string {
    indexing: attribute | summary
    attribute: fast-search
    rank: filter
}
```

`title` is for searching. `title_facet` is the same string stored as an attribute,
for grouping and filtering. Storing a field twice feels wrong the first time you do
it and is completely routine: these are two different data structures answering two
different questions, and neither can do the other's job.

### Where the clusters come from

The facet on the page groups by `cluster_name`, which is not a Wikipedia category.
It is k-means run over the passage embeddings at feed time, in `make_feed.py`:
every passage is assigned to one of eight groups by vector similarity, so the groups
are whatever the corpus actually separates into rather than whatever someone decided
in advance.

The names are derived too. For each cluster, the script finds the terms most
over-represented inside it compared to the rest of the corpus, with one extra rule:
a term must appear in at least three distinct articles before it is allowed to name
a cluster. Without that rule one long article about a single alpine sportive
contributed enough proper nouns to name a whole cluster after itself. With it, the
eight come out as recognisable themes — history and invention, bike sharing,
handling physics, lighting and e-bikes, off-road disciplines, infrastructure and
junctions, routes and trails, components.

This is the same clustering, with the same seed, that colours the scatter plot on
the in-browser version of this project. The picture there and the facets here are
two views of one partition.

---

## Part 4: filtering, and what "at scale" changes

### Filtering is not post-processing

Unticking articles in the page's settings panel sends this along with the query:

```
doc_id in ("bicycle-frame", "bicycle-wheel", …)
```

The naive approach is to search normally and discard the results that fail the
filter. That is wrong in a way that matters: if you ask for ten results and the
filter removes nine of your top ten, you return one. And it gets worse the harder
you filter, which is backwards from what anyone expects.

Done properly, the filter is part of matching. The engine resolves it first and the
ranker only ever sees documents that passed. Ask for ten and you get ten, if ten
exist. Here that is three lines of schema:

```
field doc_id type string {
    indexing: attribute | summary
    attribute: fast-search
    rank: filter
}
```

`attribute` puts the field in memory as a column. `fast-search` builds a B-tree over
it, so matching a few hundred ids is a few hundred lookups rather than a scan of
every document. `rank: filter` declares that this field can never contribute to a
score, only to whether a document matches at all — which lets Vespa store it in a
more compact form, because it no longer needs the per-document statistics that
scoring would require.

The pleasant consequence is that narrowing the scope makes the search *faster*. The
filter is the cheap part of the query, and anything it removes is work the expensive
parts do not do. The same mechanism, with a tenant id instead of an article id, is
how one index serves many customers without any of them being able to see another's
documents.

### Streaming mode: the same corpus, with nothing built in advance

Everything above assumes **indexed** mode: build the inverted index and the HNSW
graph up front, at feed time, and pay for them in memory and in indexing cost
forever. That is the right trade when any query might touch any document.

But consider a mail search where every query is one person searching their own
mailbox. You might have a hundred million messages and ten million users. An index
over all hundred million is enormous, and it is doing work you never need — no query
will ever range across users. What you actually need is to search ten thousand
messages, quickly, ten million different ways.

**Streaming** mode is for exactly that. It builds no index. Documents are stored
grouped by a key — the user id — and a query names its group, and Vespa reads that
group's documents straight off disk and evaluates the query against each one. Linear
scanning, which sounds absurd until you notice it is a linear scan of ten thousand
documents and not of a hundred million. In exchange you get no index memory at all,
no indexing latency, substring and regex matching that an inverted index cannot do,
and writes that are visible immediately.

This application runs **both**. There are two content clusters in `services.xml`
holding the same passages, and the page lets you put one question through each.

The obstacle to demonstrating streaming mode is that its natural example is a
mailbox, and nobody's mailbox belongs on a public demo page. An article is the same
*shape* of thing: a group you always search the whole of and never across. So the
second cluster is partitioned by article, and the group travels in the document id:

```
id:cycling:article_passage:g=bicycle-brake:bicycle-brake-7
                            ^^^^^^^^^^^^^^
```

The query names its group in a parameter rather than in the YQL, because the group
is not a filter — it decides which documents are read at all:

```
streaming.groupname=bicycle-brake
```

That is the whole mechanism. A missing group is not an error; it is simply zero
documents to scan, which is what query 11 in `queries.sh` shows.

### What the second schema does not contain

`article_passage.sd` is best read as a diff against `passage.sd`, and nearly all of
the difference is absence.

**No HNSW block.** Nearest-neighbour search still works, and it is now *exact*: the
query vector is compared against every passage in the group. A graph only pays for
itself when there are too many vectors to look at them all, and a few dozen passages
is not that. Declaring `index` with an `hnsw` block in a streaming cluster is not an
error — it is quietly ignored, which is worse, because it looks like it worked.

**No `fast-search`.** That builds a B-tree so a lookup does not have to scan.
Streaming scans by definition, so the B-tree would be memory spent to accelerate
something that is not happening.

**No ColBERT field.** This is the one genuine capability loss, and it has a specific
cause: `second-phase` has no effect in streaming mode. The indexed `colbert` profile
reranks the top 200 per node in a second phase, and a second phase that never runs
is not a demo, it is a trap. So the streaming schema offers three rank profiles, not
four, and the page hides the fourth button rather than offering something that
cannot execute. The secondary reason is that per-token vectors are by far the
largest thing in the indexed schema, and the whole claim of streaming mode is how
little it stores per document.

### The part that is easy to get wrong

BM25 still works in streaming mode. But BM25 normalises for document length — a term
appearing twice in a ten-word title means more than twice in a thousand-word page —
and to do that it needs to know the *average* field length across the corpus.

Streaming mode has no corpus-wide term statistics, because it has no corpus-wide
anything. It never looks at more than one group. So it falls back to assuming every
field averages 100 words, which here is wrong in both directions: a title is about
two words and a passage about a hundred and fifty. Tell the ranker that a two-word
title averages a hundred words and every title match looks like a freakishly short,
freakishly specific document, and the scores drift apart from the indexed cluster
for reasons that have nothing to do with retrieval.

The fix is to measure the averages once, offline, and write them down:

```
rank-properties {
    bm25(text).averageFieldLength: 149
    bm25(title).averageFieldLength: 2
    bm25(section).averageFieldLength: 4
}
```

`make_feed.py` prints those three numbers at the end of every run, which is where
these came from. This is the honest cost of streaming mode and it is not a rounding
error: without these three lines the same text scores differently in the two
clusters, and nothing warns you.

### Which one to choose

Not a question about scale in the abstract. It is about whether your queries
partition. If every query lives inside one tenant, stream: you get no index memory,
immediate visibility of writes, and a per-document cost low enough that a million
small groups cost a million small groups' worth of disk and no index at all. If any
query can touch anything, index.

The reason both are here is that the trade is easiest to believe when the same
question goes through both and you can see what each one gives up.

---

## Where to look in the code

`app/schemas/passage.sd` is the file to read first. Everything in parts one and two
is in the four rank profiles at the bottom, and everything in parts three and four
is in the field definitions at the top. `app/schemas/article_passage.sd` is the
streaming half, and is shorter mostly by subtraction — read it against the first.
`app/services.xml` holds the two content clusters, the two embedders, and the CORS
filters that let a browser on another origin call the cluster at all.
`scripts/queries.sh` runs eleven `curl` commands covering each rank profile, the
grouping expression, both kinds of filter and all three streaming cases — the
fastest way to see the raw JSON behind everything described here.

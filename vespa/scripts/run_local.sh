#!/usr/bin/env bash
#
# Bring up Vespa locally and load the cycling corpus into it.
#
# One command, from a cold machine to a cluster the page can query:
#
#     ./vespa/scripts/run_local.sh
#
# It is safe to re-run. Deploying again over a running cluster is the normal way
# to apply a schema change, and feeding again overwrites documents by id rather
# than duplicating them.
#
# Steps, so that a failure part-way is readable:
#   1. start the Vespa container
#   2. fetch the Vespa CLI if it is not already on PATH
#   3. wait for the config server
#   4. deploy vespa/app
#   5. build both feeds from the existing corpus
#   6. feed the indexed cluster
#   7. feed the streaming cluster
#
# Step 7 is skippable:
#
#     ./vespa/scripts/run_local.sh --no-streaming
#
# The page works without it; the streaming/indexed comparison is the only thing
# that needs it, and it says so plainly rather than failing oddly.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$ROOT/vespa/app"
FEED_FILE="$ROOT/vespa/feed.json"
STREAMING_FEED_FILE="$ROOT/vespa/feed-streaming.json"
CLI_DIR="$ROOT/vespa/.cli"
CONTAINER="vespa-cycling"

WITH_STREAMING=1
for arg in "$@"; do
  case "$arg" in
    --no-streaming) WITH_STREAMING=0 ;;
    # Print the header comment rather than a second, driftable copy of it.
    -h|--help) sed -n '2,/^[^#]/p' "${BASH_SOURCE[0]}" | sed '$d; s/^#\s\{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# The two ONNX models are 133 MB and 436 MB and are held in memory alongside
# Vespa itself. 4 GB is not enough; the container dies part-way through feeding
# with an error that does not mention memory.
MEMORY="${VESPA_MEMORY:-8g}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
die() { printf '\n\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is not installed or not on PATH."
docker info >/dev/null 2>&1 || die "the Docker daemon is not running."

# ---------------------------------------------------------------- 1. container
if [ "$(docker ps -q -f name="^${CONTAINER}$")" ]; then
  log "Container ${CONTAINER} is already running."
elif [ "$(docker ps -aq -f name="^${CONTAINER}$")" ]; then
  log "Starting existing container ${CONTAINER}..."
  docker start "$CONTAINER" >/dev/null
else
  log "Creating container ${CONTAINER} (memory ${MEMORY})..."
  # 8080 is the query and feed endpoint the page talks to.
  # 19071 is the config server, used only by deploy.
  docker run --detach --name "$CONTAINER" \
    --hostname vespa-cycling \
    --memory "$MEMORY" \
    --publish 8080:8080 \
    --publish 19071:19071 \
    vespaengine/vespa >/dev/null
fi

# ---------------------------------------------------------------------- 2. CLI
if command -v vespa >/dev/null 2>&1; then
  VESPA_BIN="$(command -v vespa)"
  log "Using Vespa CLI at ${VESPA_BIN}"
else
  if [ ! -x "$CLI_DIR/vespa" ]; then
    log "Vespa CLI not found; downloading a local copy into vespa/.cli ..."
    case "$(uname -s)" in
      Linux)  OS="linux"  ;;
      Darwin) OS="darwin" ;;
      *) die "Unsupported OS. Install the Vespa CLI manually: https://docs.vespa.ai/en/vespa-cli.html" ;;
    esac
    case "$(uname -m)" in
      x86_64|amd64) ARCH="amd64" ;;
      arm64|aarch64) ARCH="arm64" ;;
      *) die "Unsupported architecture $(uname -m)." ;;
    esac

    VERSION="$(curl -fsSL https://api.github.com/repos/vespa-engine/vespa/releases/latest \
                | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)"
    [ -n "$VERSION" ] || die "Could not determine the latest Vespa CLI version."

    mkdir -p "$CLI_DIR"
    curl -fsSL "https://github.com/vespa-engine/vespa/releases/download/v${VERSION}/vespa-cli_${VERSION}_${OS}_${ARCH}.tar.gz" \
      | tar -xz -C "$CLI_DIR" --strip-components=2 "vespa-cli_${VERSION}_${OS}_${ARCH}/bin/vespa"
    chmod +x "$CLI_DIR/vespa"
  fi
  VESPA_BIN="$CLI_DIR/vespa"
  log "Using Vespa CLI at ${VESPA_BIN}"
fi

"$VESPA_BIN" config set target local

# --------------------------------------------------------------- 3. config srv
log "Waiting for the config server on :19071 (first start takes a minute)..."
for attempt in $(seq 1 120); do
  if curl -fsS -o /dev/null http://localhost:19071/state/v1/health 2>/dev/null; then
    echo "    config server is up."
    break
  fi
  [ "$attempt" -eq 120 ] && die "config server did not come up. Check: docker logs ${CONTAINER}"
  sleep 2
done

# ------------------------------------------------------------------- 4. deploy
# The first deploy downloads both ONNX models (about 570 MB) inside the
# container, so the timeout is generous. Later deploys reuse the cached models.
log "Deploying the application package..."
"$VESPA_BIN" deploy --wait 900 "$APP_DIR"

log "Waiting for the query endpoint on :8080..."
for attempt in $(seq 1 180); do
  if curl -fsS -o /dev/null http://localhost:8080/state/v1/health 2>/dev/null; then
    echo "    query endpoint is up."
    break
  fi
  [ "$attempt" -eq 180 ] && die "query endpoint did not come up. Check: docker logs ${CONTAINER}"
  sleep 2
done

# -------------------------------------------------------------------- 5. feeds
if [ ! -f "$FEED_FILE" ] || { [ "$WITH_STREAMING" = "1" ] && [ ! -f "$STREAMING_FEED_FILE" ]; }; then
  log "Building the feeds from public/rag/corpus.json..."
  python3 "$ROOT/vespa/scripts/make_feed.py" -o "$FEED_FILE" --streaming-out "$STREAMING_FEED_FILE"
else
  log "Reusing the existing feed files (delete them to rebuild)."
fi

# Vespa embeds every passage on the way in, on CPU. The indexed cluster embeds
# each one twice - once with e5 and once with ColBERT - and ColBERT is by far
# the more expensive of the two. That is the slow part: expect roughly 15-40
# minutes for all 3,365 passages on a laptop, and almost none of it is Vespa's
# indexing.
log "Feeding the indexed cluster. This is the slow step: both embedders run"
echo "    over every passage on CPU. Budget 15-40 minutes for the full corpus."
echo "    For a quick trial instead, stop here (ctrl-C) and run:"
echo "      python3 vespa/scripts/make_feed.py --limit 200 -o /tmp/small.json --no-streaming"
echo "      $VESPA_BIN feed /tmp/small.json"
echo
"$VESPA_BIN" feed "$FEED_FILE"

# ----------------------------------------------------------- 6. streaming feed
# Same passages, second content cluster, no ColBERT. Noticeably quicker than the
# step above for exactly that reason - which is itself one of the things the
# streaming comparison on the page is about.
if [ "$WITH_STREAMING" = "1" ]; then
  log "Feeding the streaming cluster (e5 only, so quite a bit quicker)..."
  "$VESPA_BIN" feed "$STREAMING_FEED_FILE"
else
  log "Skipping the streaming cluster (--no-streaming)."
  echo "    The page's streaming mode will report that the cluster is empty."
fi

log "Done. The cluster is at http://localhost:8080"
echo "    Smoke-test it:   ./vespa/scripts/queries.sh"
echo "    Point the page at it: it defaults to http://localhost:8080 already."
echo "    Stop it:         docker stop ${CONTAINER}"

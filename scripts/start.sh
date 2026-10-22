#!/bin/sh
# Container entrypoint. One image runs either role, chosen by NEWSWIZ_ROLE:
#   web    (default) the Next.js app, listening on $PORT (Railway sets it) or 3000
#   worker the ingest worker (feed polling + daily source discovery)
set -e
ROLE="${NEWSWIZ_ROLE:-web}"

case "$ROLE" in
  web)
    # A public deployment without a passphrase would expose everything, including reader-view copies.
    if [ -n "$RAILWAY_ENVIRONMENT" ] && [ -z "$APP_PASSPHRASE" ]; then
      echo "Refusing to start: set APP_PASSPHRASE before running NewsWiz on a public URL." >&2
      exit 1
    fi
    exec pnpm --filter @newswiz/web start
    ;;
  worker)
    exec pnpm ingest
    ;;
  *)
    echo "Unknown NEWSWIZ_ROLE '$ROLE' (use web or worker)" >&2
    exit 1
    ;;
esac

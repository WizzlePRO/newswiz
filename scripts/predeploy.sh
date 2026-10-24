#!/bin/sh
# Runs before each deploy (railway.json preDeployCommand): schema migrations, then the source seed.
# A script rather than "a && b" because Railway runs Dockerfile commands without a shell.
set -e
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set. On Railway, add DATABASE_URL=\${{Postgres.DATABASE_URL}} to this service's variables." >&2
  exit 1
fi
pnpm migrate
pnpm seed

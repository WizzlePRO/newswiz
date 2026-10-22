.PHONY: up down logs dev db setup ingest-once verify-sources test typecheck

## Run everything in Docker: Postgres, migrations + seed, ingest worker, web app on :3000.
up:
	@test -f .env || cp .env.example .env
	docker compose up -d --build
	@echo "NewsWiz is starting at http://localhost:$${WEB_PORT:-3000} (first articles arrive within a minute)"

down:
	docker compose down

logs:
	docker compose logs -f --tail=100 ingest web

## Local development: Postgres in Docker, app and worker on your machine with hot reload.
db:
	docker compose up -d db

setup: db
	@test -f .env || cp .env.example .env
	pnpm install
	pnpm migrate
	pnpm seed

dev: setup
	@echo "Starting the ingest worker and the web app (Ctrl-C stops both)"
	@trap 'kill 0' INT TERM; pnpm ingest & pnpm dev:web & wait

ingest-once:
	pnpm ingest:once

## Check every feed in data/sources.json responds, parses, and is fresh.
verify-sources:
	pnpm verify-sources

test:
	pnpm test

typecheck:
	pnpm typecheck

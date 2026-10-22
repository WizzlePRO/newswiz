# One image for the web app, the ingest worker, and the migrate/seed step.
FROM node:22-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Install dependencies first so code changes don't bust the cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/net/package.json packages/net/
COPY packages/reader/package.json packages/reader/
COPY workers/ingest/package.json workers/ingest/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @newswiz/web build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@newswiz/web", "start"]

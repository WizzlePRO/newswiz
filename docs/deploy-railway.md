# Deploying NewsWiz to Railway

Railway builds the repo's `Dockerfile` and reads `railway.json`. You'll end up with three services in one project:

| Service | What it runs | Public URL |
|---|---|---|
| **web** | The Next.js app (`NEWSWIZ_ROLE=web`) | Yes |
| **worker** | Feed polling every 30s and daily source discovery (`NEWSWIZ_ROLE=worker`) | No |
| **Postgres** | The database | No |

On every deploy, migrations and the source seed run first (`preDeployCommand`). A database lock keeps the two app services from running them at the same time. Pushing to `main` redeploys both app services.

## 1. Create the project from GitHub

1. Sign in at <https://railway.com> with your GitHub account.
2. Click **New Project → Deploy from GitHub repo** and choose **WizzlePRO/newswiz**.
   If the repo isn't listed, click **Configure GitHub App** and give Railway access to `newswiz`.
3. Railway creates a service and starts building. **This first deploy will fail.** That's expected: there's no database or passphrase yet.

## 2. Add Postgres

On the project canvas, click **Create** (or **+ New**) → **Database** → **PostgreSQL**. Wait until it shows as running.

## 3. Configure the web service

1. Click the service Railway created from the repo. Under **Settings**, rename it to `web`.
2. Open **Variables → Raw Editor** and paste this, replacing the passphrase:

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   NEWSWIZ_ROLE=web
   PORT=3000
   APP_PASSPHRASE=replace-with-a-long-random-passphrase
   APP_TIMEZONE=America/New_York
   INGEST_CONTACT=https://github.com/WizzlePRO/newswiz
   ```

   - **Passphrase:** generate one with `openssl rand -base64 24`. You'll type it on each device the first time.
   - **Required:** the web service refuses to start on Railway without `APP_PASSPHRASE`. Without it, anyone with the URL could read everything.
   - **Database name:** `${{Postgres.DATABASE_URL}}` is a Railway reference. If your database service has a different name, use that name instead of `Postgres`.
3. Click **Deploy** (Railway shows a banner after variable changes).
4. Under **Settings → Networking → Public Networking**, click **Generate Domain** and enter port **3000**.
   You get a URL like `https://web-production-1234.up.railway.app`.

## 4. Add the worker service

1. On the canvas, click **Create → GitHub Repo** and choose **WizzlePRO/newswiz** again. Rename the new service `worker`.
2. In **Variables → Raw Editor**, paste:

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   NEWSWIZ_ROLE=worker
   PORT=8080
   APP_TIMEZONE=America/New_York
   INGEST_CONTACT=https://github.com/WizzlePRO/newswiz
   ```

   `PORT` only serves the worker's health check; don't give the worker a public domain.
3. Click **Deploy**.

## 5. Check it

- **Worker:** its **Deployments → logs** should show lines like `cycle: 62 feeds polled, 1905 new articles` within a minute.
- **Health:** open `https://<your-domain>/api/health`. It should return `{"ok":true,"articles":…}`.
- **App:** open `https://<your-domain>/`, sign in with your passphrase, and Catch up should fill in.
- **Phone home screen:** in Safari, use Share → **Add to Home Screen**. On Android Chrome, use ⋮ → **Install app**.

## Notes

- **Sites that blocked the build server may work here.** Some feeds and reader-view fetches were refused from the build server (Washington Post, CBC, Washington Times; reader view for the Guardian, DW, NY Post). Railway's addresses are different, so check the **Sources** page for feed health.
- **Source discovery** runs on the worker's first loop after a deploy, then every 24 hours. Suggestions appear on **Discover**.
- **Changing the passphrase** signs out every browser and app. They sign in again with the new one.
- **Phase 2 needs pgvector** (story clustering). Railway's standard Postgres may not include it. Phase 2 will cover switching to a pgvector-enabled Postgres, or confirming the current one supports it.

# Nirmāṇ Auditor

An offline-first Android app for tracking construction materials. Site staff photograph bills or handwritten notes, dictate (English or Hindi) or type what was bought. The backend reads it with Google Gemini and turns it into clean line items: Hindi/Hinglish terms become standard English names and units. The app keeps an audit log with vendor rates, Bills of Quantities for quotes, saved sessions per site, and a material price database built from everything recorded.

## How it works

```
apps/mobile      React + Vite UI packaged as an Android app with Capacitor
apps/server      Fastify + PostgreSQL API: accounts, sync, AI extraction
packages/shared  Types/validation, prompt + parsing, price-database logic
```

- **Offline first.** The phone keeps its own SQLite database, and every screen reads and writes it directly, so the app works with no signal.
- **Queued AI extraction.** An entry captured offline (text, voice or up to 5 photos) is queued on the phone. When a connection returns, the queue is sent to the server, which calls Gemini, and the items are added to the list. The Gemini key only ever lives on the server.
- **Sync and backup.** Changed rows are pushed to the server and changes from other devices are pulled. If the same row changes on two devices, the most recent edit wins, and deletions sync too. The account holds the backup, and signing in on a new phone restores everything.
- **Using it without an account.** The app works without an account. Anything recorded is uploaded the first time you sign in.

## Local development

Requirements: Node 22 and Docker (or any Postgres 16).

```bash
npm install
docker compose up -d db                 # Postgres on :5432 (also creates nirman_test)
cp apps/server/.env.example apps/server/.env   # set JWT_SECRET and GEMINI_API_KEY
npm run dev:server                      # API on http://localhost:8080 (runs migrations)
npm run dev:mobile                      # app on http://localhost:3000
```

In the browser the app uses an in-memory SQLite database (sql.js) saved to IndexedDB, so it behaves like the phone.

### Tests

```bash
TEST_DATABASE_URL=postgres://nirman:nirman@localhost:5432/nirman_test npm test
npm run lint
```

The tests cover:
- the shared domain logic;
- every server route, run against real Postgres;
- the phone's local database;
- an end-to-end run in which two simulated phones edit offline and sync through the real server.

## Android app

```bash
npm run build -w apps/mobile
cd apps/mobile
npx cap sync android
npx cap open android        # build/run from Android Studio, or:
cd android && ./gradlew assembleDebug
```

- Set `VITE_API_URL` (see `apps/mobile/.env.example`) to your server before building.
- To test against a server running on your computer from the emulator, use `http://10.0.2.2:8080` and build with `CAP_ALLOW_HTTP=1` so plain HTTP is allowed. Release builds should talk to an HTTPS server.
- CI (`.github/workflows/ci.yml`) builds a debug APK on every push and uploads it as an artifact. The API URL comes from the repository variable `NIRMAAN_API_URL`.
- For Play Store releases, add a signing config and use `./gradlew bundleRelease`.

## Deploying the server

`apps/server/Dockerfile` builds a small image; build it from the repo root with `docker build -f apps/server/Dockerfile .`. It runs on Cloud Run or any container host.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (migrations run on start) |
| `JWT_SECRET` | 32+ random characters for signing access tokens |
| `GEMINI_API_KEY` | Google Gemini key used for extraction |
| `GEMINI_MODEL` | Optional, defaults to `gemini-3-flash-preview` |
| `CORS_ORIGINS` | Optional extra browser origins (the app's own origins are allowed already) |

### API

| Endpoint | |
| --- | --- |
| `POST /auth/register`, `/auth/login` | Email + password; returns access and refresh tokens |
| `POST /auth/refresh`, `/auth/logout` | Rotate or revoke a refresh token |
| `POST /sync/push` | Upload changed rows (newest `updated_at` wins) |
| `GET /sync/pull?since=<cursor>` | Rows changed since the cursor, paged |
| `POST /extractions` | Text and/or JPEGs → material line items; retries with the same `job_id` reuse the result |
| `GET /health` | Liveness + database check |

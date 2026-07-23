# Games API

Serverless functions (Vercel) backing the Neon-stored leaderboard(s) for
the games in this repo. The games themselves are static HTML hosted on
GitHub Pages, which can't run server code or safely hold a database
connection string -- this is the small bit of backend that can.

- `leaderboard.js` — `GET /api/leaderboard?game=spaceship&limit=10`
- `score.js` — `POST /api/score` with JSON body `{ name, score, game? }`

Both read `process.env.DATABASE_URL` (a Neon Postgres connection
string) — set as a Vercel project Environment Variable, never committed
here.

## One-time setup

1. Run `schema.sql` against your Neon database (Neon dashboard -> SQL
   editor -> paste -> run).
2. Import this repo into Vercel (vercel.com -> Add New Project -> pick
   this repo). Vercel auto-detects `api/*.js` as serverless functions.
3. In the Vercel project's Settings -> Environment Variables, add
   `DATABASE_URL` = your Neon connection string, then deploy.
4. Note the resulting `https://<project>.vercel.app` URL and set it as
   `API_BASE` near the top of the space-ship game's `<script>` (search
   for `API_BASE` — it's an empty string until this step is done, and
   the game works fine without it, just falls back to a
   per-device `localStorage` leaderboard instead of the shared one).

GitHub Pages keeps serving the static game files exactly as before --
this API is a separate deployment on a separate domain, only reachable
via `fetch()` from the game's own JS.

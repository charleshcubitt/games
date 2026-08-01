# games-portal

Portal site for the commercial version of the games in the sibling
`games` repo (space-ship, word-game, battletank, ...). Casual browser
games, played after email login + an all-access subscription (or a free
voucher code).

> Domain: **neon-flashback.com** (registered via Cloudflare, attached to
> the deployed Worker via `wrangler.jsonc`'s `routes`). Repo
> folder/package name (`games-portal`) is still a placeholder -- rename
> is a separate, optional step.

## Stack

- **Frontend**: Astro (`output: 'server'`), deployed as a Cloudflare
  Worker via `@astrojs/cloudflare` -- most pages check auth/entitlement
  per request, so this isn't a static site.
- **Auth**: [Neon Auth](https://neon.com/docs/auth/overview) -- Neon's
  managed Better Auth, integrated into the existing Neon project. User
  records land in `neon_auth."user"` automatically -- no separate
  identity DB to sync.
- **Database**: the existing Neon Postgres project, schema expanded (see
  `db/`).
- **Payments**: PayPal Subscriptions API (all-access pass, not one-time
  purchase -- see `db/migrations/0001_init.sql` for why `subscriptions`
  tracks lifecycle state rather than a single payment row).
- **Hosting**: Cloudflare Pages/Workers.

## Server-side identity verification

There's no Astro adapter for Neon Auth's server-side session helper
(`createNeonAuth()` only ships for Next.js), so API routes verify
identity by hand: the client attaches `session.data.session.token` (a
JWT already present on the session object -- no need for the separate
`getJWTToken()`/`get-jwt-token` endpoint, which 404s on this project) as
a Bearer token, and `src/lib/serverAuth.ts` verifies it against the auth
server's published JWKS using `jose`. Two non-obvious gotchas hit while
building this, both worth knowing before touching it again:

- The token's `iss`/`aud` claims are the bare origin
  (`https://ep-xxx.neonauth...`), **not** the full `/<dbname>/auth` path
  used for the JWKS/API base URL -- verify against `new URL(authBaseUrl).origin`.
- `PUBLIC_NEON_AUTH_URL` must point at the *same branch* as
  `DATABASE_URL` (see "Auth setup" below) or every verified user will be
  a 404/foreign-key-miss against that branch's `neon_auth."user"`.
- Neon Auth has a separate trusted-origins allowlist, unrelated to
  `PUBLIC_NEON_AUTH_URL`. Every origin that will call `sign-up`/`sign-in`
  needs to be added explicitly or every request 403s with "Invalid
  origin" -- `localhost` is allowed by a separate toggle
  (`neonctl neon-auth domain allow-localhost`), but a real deployed
  domain is not automatic:
  ```sh
  neonctl neon-auth domain add "https://your-domain" --project-id <id> --branch <branch>
  ```
  Hit this the first time `neon-flashback.com` went live -- sign-up
  worked in local dev but 403'd in production until the domain was
  added.

`src/lib/db.ts` wraps `@neondatabase/serverless`'s HTTP driver (works
over `fetch`, so it runs fine both in `astro dev` and deployed to a
Worker -- unlike `pg`, which needs raw TCP sockets Workers don't have),
reading `DATABASE_URL` via `cloudflare:workers`' `env` import.

## Status

v1 scope: **space-ship** and **word-game**. battletank stays on its
current unauthenticated setup until it's ready to fold in.

- [x] Astro + Cloudflare adapter scaffolded
- [x] Schema drafted (`db/migrations/`)
- [x] Neon Auth enabled on the Neon project, SDK wired into this app
      (`src/lib/auth.ts`)
- [x] Migrations run against a dev branch (`dev`, branched off
      `production`; `app_worker` role created and verified: reads/writes
      the tables it should, blocked from DDL and from `audit_log`
      mutation)
- [x] Login page (`src/pages/login.astro` -- email/password sign
      up+in+out via the Neon Auth client, session persists across
      reload)
- [x] Game catalog (`src/pages/index.astro` + `src/pages/api/entitlement.ts`
      -- lists `games` from the DB, shows Play/demo/locked per user via
      JWT-verified entitlement check against `active_access`)
- [x] Account page (`src/pages/account.astro` + `src/pages/api/account.ts`
      + `src/pages/api/redeem-voucher.ts` -- shows subscription/access
      status and redeemed vouchers, voucher redemption form)
- [x] Voucher redemption also available directly from the login/sign-up
      form (`src/pages/login.astro` -- "Have a voucher code?" toggle,
      auto-redeems right after sign-up/sign-in succeeds), not just from
      the account page. Live promo code in the `dev` branch DB:
      `QWERTY123`, grants 7 days, redemption cap set high (100000) since
      it's meant for wide distribution, not single-use.
- [x] PayPal subscription integration (`src/lib/paypal.ts`,
      `src/pages/api/paypal/` -- see "Payments setup" below; the
      reject-invalid-signature path is verified live through a real
      tunnel, but the accept-a-genuine-webhook path still needs testing
      against a real event, see caveats below)
- [x] Gated game delivery (`src/pages/play/[slug].astro` +
      `src/pages/api/play/[slug].ts` -- proxies each game's
      `games.source_url` server-side, gated by the same entitlement
      check as the catalog. Verified live for all four cases: anonymous
      + demo succeeds, anonymous + no-demo gets `login_required`, signed
      in + no subscription gets `subscription_required`, entitled user
      gets the real game regardless of the demo flag)
- [ ] **Known gap**: the games' GitHub Pages URLs
      (`games.source_url`) are still directly, publicly reachable and
      bypass the gate entirely -- gating only helps traffic that goes
      through the portal. Closing this for real means either taking the
      games off GitHub Pages (breaks the old bookmarked URLs) or
      accepting the direct link as a low-priority gap for a casual
      audience that will overwhelmingly arrive via the portal. Revisit
      before this matters commercially.
- [ ] word-game gets its first real backend integration (currently
      localStorage + manual "copy scores" only) and gets migrated too

## Database setup

Run once per environment (dev/staging/prod are separate Neon
branches/projects, never share credentials across them):

1. Enable Neon Auth on the target Neon project (console → Auth). This
   creates the `neon_auth` schema that `0001_init.sql` references --
   run this first.
2. Apply migrations in order:
   ```sh
   psql "$DATABASE_URL" -f db/migrations/0001_init.sql
   psql "$DATABASE_URL" -f db/migrations/0002_audit_log_append_only.sql
   psql "$DATABASE_URL" -f db/migrations/0003_games_source_url.sql
   ```
3. Create the least-privilege application role (see the comments in the
   file for why this matters and how to supply the password safely):
   ```sh
   psql "$DATABASE_URL" -v app_worker_password='...' -f db/setup/roles.sql
   ```
4. The connection string the app actually uses is the `app_worker` role,
   not the Neon-issued owner credential. Store it with
   `wrangler secret put DATABASE_URL`, never in `.env` or the repo.

## Auth setup

**The auth endpoint is per-branch, same as the database connection.**
`PUBLIC_NEON_AUTH_URL` and `DATABASE_URL` must point at the *same*
branch, or every write that references `neon_auth."user"(id)`
(`subscriptions`, `voucher_redemptions`, `payments`, `game_sessions`,
`audit_log`) will fail to find the user, since each branch gets its own
independent copy of `neon_auth` after the branch point (copy-on-write,
not synced afterward). Branching in the console/CLI only gives you the
new `DATABASE_URL`-side connection string -- the matching auth URL has
to be built by hand: swap the compute endpoint id into the same
`https://<endpoint-id>.neonauth.<region>....neon.tech/<dbname>/auth`
pattern (get the endpoint id from the branch's own connection string).

The Auth Base URL from the Neon console's Auth → Configuration tab goes
in `PUBLIC_NEON_AUTH_URL`:

- Local dev: `.env` (gitignored), e.g.
  `PUBLIC_NEON_AUTH_URL=https://ep-xxx.neonauth.<region>.aws.neon.tech/<dbname>/auth`.
- Deployed: **`PUBLIC_*` vars are NOT `wrangler secret put` material.**
  Astro/Vite inlines `import.meta.env.PUBLIC_*` into the client bundle
  at *build time*, reading from `.env` -- not read at runtime from
  Cloudflare at all, unlike the server-only vars below. In practice this
  means whatever `.env` contains when you run `npm run build` is what
  ships, so keep `.env` pointed at whichever environment you're actually
  deploying (right now: the `dev` Neon branch + PayPal sandbox).

`src/lib/auth.ts` wraps `@neondatabase/neon-js`'s `createAuthClient`.
`authClient.signUp.email({ name, email, password })` requires `name` --
Better Auth's default user schema, not optional.

## Payments setup

PayPal Subscriptions (all-access, $2.99/month, `scripts/paypal-setup.mjs`
created the Product+Plan). Sandbox and live are entirely separate PayPal
apps with their own Client ID/Secret/Plan/Webhook -- re-run the setup
script and everything below for live when going live.

**Design decision**: webhook payloads aren't trusted for billing details
(PayPal has a documented history of sometimes omitting
`PAYMENT.SALE.COMPLETED`'s `billing_agreement_id`). A webhook is only
ever used as a trigger to call `GET /v1/billing/subscriptions/{id}` and
write *that* response -- see `src/lib/paypal.ts` and
`src/pages/api/paypal/webhook.ts`. The `subscriptions` row itself is
first created by `src/pages/api/paypal/record-subscription.ts`, called
by the client right after the PayPal Buttons `onApprove` callback (using
our own authenticated session to establish the `user_id` link, not
anything PayPal hands back) -- webhooks afterward only ever `UPDATE` an
existing row by `provider_subscription_id`, never `INSERT`, so a webhook
racing ahead of that call is a harmless no-op.

Env vars (`.dev.vars` for local, `wrangler secret put` for deployed):
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV` (`sandbox` or
`live`), `PAYPAL_PLAN_ID`, `PAYPAL_WEBHOOK_ID`. Also `.env`:
`PUBLIC_PAYPAL_CLIENT_ID`, `PUBLIC_PAYPAL_PLAN_ID` (the Subscribe button
is client-side JS, so these two are exposed the same way the Client ID
already is on PayPal's own JS SDK docs -- not a secret, just an
identifier).

**Known gaps, not yet closed:**

- The registered webhook now points at the real live domain
  (`https://neon-flashback.com/api/paypal/webhook`), not a dead tunnel.
  If the domain or Worker name ever changes, re-register
  (`POST /v1/notifications/webhooks`) and update `PAYPAL_WEBHOOK_ID` in
  both `.dev.vars` and `wrangler secret put`.
- The full "buyer approves a subscription -> webhook fires -> DB
  updates" path has still not been verified against a real event.
  `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` are the *business/developer*
  sandbox app credentials, which can't themselves complete a purchase --
  that needs a sandbox *buyer* test account (Developer Dashboard ->
  Sandbox -> Accounts). PayPal's `/v1/notifications/simulate-event` API
  consistently returns 202 but never actually delivers to either a
  tunnel URL or the real live domain -- confirmed to be a general
  limitation of that specific API, not anything tunnel/domain-specific.
  What *is* verified live against the real domain:
  `src/pages/api/paypal/webhook.ts` correctly rejects a request with an
  invalid/missing signature (400). The subscribe button itself renders
  and loads the real PayPal SDK correctly (tested headless).
- No refund/dispute handling, no email receipts -- out of scope for now.

## Deployment

**Live at https://neon-flashback.com** (Neon `dev` branch + PayPal
sandbox -- not real production data yet, see the deploy-scope decision
in git history).

```sh
npm run build
npx wrangler deploy
```

`wrangler deploy` reads `wrangler.jsonc`'s `routes` (`custom_domain:
true` on `neon-flashback.com`) -- the DNS/zone side is automatic once
the domain is registered on this Cloudflare account, no manual DNS
records needed. A few things that weren't obvious the first time
through:

- **`workers_dev: false` alone isn't enough** to suppress the
  `workers.dev` fallback -- `dist/server/wrangler.json` (generated by
  `astro build` from `wrangler.jsonc`) has to actually be *regenerated*
  after editing `wrangler.jsonc`, or `wrangler deploy` silently uses a
  stale snapshot. Always `npm run build` immediately before
  `wrangler deploy` if `wrangler.jsonc` changed.
- **Neon Auth has its own trusted-origins allowlist**, separate from
  everything else -- see the "Neon Auth has a separate trusted-origins
  allowlist" gotcha under "Server-side identity verification" above.
  Sign-up/sign-in will 403 with "Invalid origin" on a new domain until
  it's added via `neonctl neon-auth domain add`.
- Server-only secrets (`DATABASE_URL`, `PAYPAL_CLIENT_ID`,
  `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `PAYPAL_PLAN_ID`,
  `PAYPAL_WEBHOOK_ID`) need `wrangler secret put <NAME>` once per
  environment -- see "Payments setup" and "Database setup" above.
  `PUBLIC_*` vars don't go through `wrangler secret put` at all (see the
  "Auth setup" note on this).

## Commands

| Command | Action |
| :--- | :--- |
| `npm run dev` | Local dev server at `localhost:4321` |
| `npm run build` | Build for production |
| `npm run preview` | Preview the Cloudflare build locally |
| `npx wrangler deploy` | Deploy to Cloudflare |

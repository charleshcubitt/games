-- One-time setup, run by hand against each environment (dev/staging/prod
-- are separate Neon branches/projects with separate roles -- never share
-- one app_worker role or password across environments).
--
-- Do NOT commit a real password here. Generate one (e.g. `openssl rand
-- -hex 24` -- use hex, not base64: base64's `/` and `+` break naive
-- postgresql:// URL construction) and paste it in only while running
-- this interactively, or pass it via a psql variable. The resulting
-- connection string is a Cloudflare Worker secret
-- (`wrangler secret put DATABASE_URL`), never committed, never sent to
-- the client.
--
-- Why a dedicated role at all: the connection string Neon hands you by
-- default is an owner-level role that can DROP TABLE, alter schema, and
-- read/write everything. The Worker should run as a role that can only
-- do what the app actually needs -- so a SQL-injection bug or a leaked
-- Worker secret has a hard ceiling on the damage it can do.

create role app_worker login password :'app_worker_password';

-- Table grants: read/write the tables the app touches, no DDL rights at
-- all (no CREATE/ALTER/DROP), no access to neon_auth's own tables beyond
-- reading the synced user list.
grant usage on schema public, neon_auth to app_worker;
grant select on neon_auth."user" to app_worker;

grant select on games to app_worker;
grant select, insert, update on subscriptions to app_worker;
grant select, insert, update on vouchers to app_worker;
grant select, insert on voucher_redemptions to app_worker;
grant select, insert on payments to app_worker;
grant select, insert, update on game_sessions to app_worker;
grant select, insert on audit_log to app_worker; -- update/delete blocked by trigger regardless
grant select on active_access to app_worker;

-- Sequences backing the serial/identity columns above also need grants
-- for INSERT to work.
grant usage on all sequences in schema public to app_worker;

-- Close the classic Postgres default-privileges gap.
revoke all on schema public from public;

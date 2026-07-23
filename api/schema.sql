-- Run once against your Neon database (Neon dashboard -> SQL editor).
-- `game` isn't spaceship-specific -- other games in this repo (e.g. the
-- word game) can reuse the same table via api/leaderboard.js's ?game=
-- param without a migration.

create table if not exists scores (
  id serial primary key,
  game text not null default 'spaceship',
  name text not null,
  score integer not null,
  created_at timestamptz not null default now()
);

create index if not exists scores_game_score_idx on scores (game, score desc);

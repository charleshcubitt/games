-- The gated-delivery API route (src/pages/api/play/[slug].ts) needs to
-- know where each game's current build actually lives so it can fetch
-- and forward it server-side -- previously this was only known to the
-- client (hardcoded in index.astro), which the gate can't use.
alter table games add column source_url text;

update games set source_url = 'https://charleshcubitt.github.io/games/space-ship/space_ship_rev30.html'
  where slug = 'space-ship';
update games set source_url = 'https://charleshcubitt.github.io/games/word-game/word_game_rev16.html'
  where slug = 'word-game';

alter table games alter column source_url set not null;

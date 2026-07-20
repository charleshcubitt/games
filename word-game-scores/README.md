# Word Game Scores

`scores.json` is a manually-updated snapshot of the local leaderboard from
[Word Game rev 15](../word-game/word_game_rev15.html) and later revisions.

## Schema

```json
{
  "scores": [
    { "name": "ABC", "score": 1234, "date": "2026-07-20T18:30:00.000Z" }
  ]
}
```

- `name` — 3-letter player name chosen at the start of a game.
- `score` — final score for that game (integer).
- `date` — ISO 8601 timestamp of when the game ended.

## Why this isn't automatic

The game itself keeps a ranked top-10 leaderboard in each device's browser
(`localStorage`), shown on the title and game-over screens. It can't push
those scores to this repo directly: GitHub Pages is a static site with no
server, so the only way client-side JavaScript could write to a GitHub repo
is by embedding a personal access token in the page's own source. Since
anyone who views the page (it's public) could read that token out of the
page source and use it to push arbitrary commits, that isn't a safe design.

Instead, the game has a "COPY SCORES" button on the title screen that copies
the current device's leaderboard as JSON (in the shape above) to the
clipboard, so a snapshot can be pasted into this file and committed by hand
whenever it's worth preserving.

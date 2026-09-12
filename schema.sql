CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  animal     TEXT,
  kind       TEXT NOT NULL,
  message    TEXT NOT NULL,
  handled    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reports_open ON reports (handled, created_at);

-- Party mode: one shared round (a target animal, hints revealed by a
-- host). A session is either a Twitch-only room, read via the streamer
-- page's own anonymous chat connection (twitch_channel set - see
-- streamer.js and functions/api/twitch/*.js), or a local/QR room joined
-- by phone (twitch_channel null) - never both in the same session, see
-- TODO.md for the full design. Both kinds call the same guess endpoint,
-- which is why there's no separate "how did they guess" table:
-- player_name and source are enough to tell rows apart on the scoreboard.
CREATE TABLE IF NOT EXISTS party_sessions (
  code             TEXT PRIMARY KEY,
  host_key         TEXT NOT NULL,
  twitch_channel   TEXT,
  category         TEXT,
  target_slug      TEXT NOT NULL,
  shown_slugs      TEXT NOT NULL DEFAULT '[]', -- JSON array, every target shown this session so next() can avoid repeats
  shown            INTEGER NOT NULL DEFAULT 1,
  resolved         INTEGER NOT NULL DEFAULT 0,
  last_winner      TEXT,               -- who took the current round, for the "X got it!" line on the host tab and overlay
  round_no         INTEGER NOT NULL DEFAULT 1,
  round_started_at INTEGER,            -- ms epoch, Twitch sessions only - see next.js/create.js. Null for local/QR play.
  round_ends_at    INTEGER,            -- ms epoch deadline the round expires at - same scope as round_started_at.
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
-- round_started_at/round_ends_at added 2026-09-12. This CREATE covers a
-- fresh install; an existing database (including production) needs the
-- same `ALTER TABLE party_sessions ADD COLUMN round_started_at INTEGER`
-- / `... round_ends_at INTEGER` run against it once, same reasoning as
-- icon below. Both nullable and only ever set for Twitch sessions (see
-- next.js) so local/QR play is untouched by the timer.
CREATE TABLE IF NOT EXISTS party_scores (
  session_code   TEXT NOT NULL REFERENCES party_sessions(code),
  player_name    TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'local',
  score          INTEGER NOT NULL DEFAULT 0,
  rounds_won     INTEGER NOT NULL DEFAULT 0,
  icon           TEXT,               -- an optional emoji the player picked at join
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (session_code, player_name)
);
-- icon added 2026-09-08 via `ALTER TABLE party_scores ADD COLUMN icon TEXT`
-- directly against the live D1 database - this CREATE is for a fresh
-- install only, the running database was already migrated in place.

-- The party page's chat-style activity feed: joins, guesses (right and
-- wrong - showing the wrong ones is the whole point, so a room full of
-- people playing together can see a guess has already been tried
-- instead of repeating it) and round-start dividers, all one shared
-- log so they render as a single cascading list in the order they
-- happened. Both local/QR play and Twitch chat guesses log here (a
-- Twitch-only session never gets 'join' rows though - see join.js).
CREATE TABLE IF NOT EXISTS party_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_code TEXT NOT NULL,
  round_no     INTEGER NOT NULL,
  kind         TEXT NOT NULL,        -- 'join' | 'guess' | 'round'
  player_name  TEXT,                 -- null for a 'round' divider
  icon         TEXT,
  text         TEXT,                 -- the raw guess text, null otherwise
  correct      INTEGER,              -- 0/1, null for 'join'/'round'
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS party_events_session ON party_events (session_code, id);

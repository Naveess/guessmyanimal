CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  animal     TEXT,
  kind       TEXT NOT NULL,
  message    TEXT NOT NULL,
  handled    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reports_open ON reports (handled, created_at);

-- Stream Mode's sync channel. An OBS Browser Source is a fully separate
-- browser process from whatever the streamer is actually using to look
-- animals up - no localStorage or BroadcastChannel reaches across that
-- gap, so the two sides meet here instead: the control page (the site,
-- used normally, with stream mode on) writes the current slug on every
-- lookup, and the overlay polls for it. One row per key, no accounts -
-- the key itself, generated client-side and living in a URL, is what
-- keeps one streamer's overlay from seeing another's lookups.
CREATE TABLE IF NOT EXISTS stream_state (
  key        TEXT PRIMARY KEY,
  slug       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Party mode: one shared round (a target animal, hints revealed by a
-- host) that guesses can reach either through Twitch chat (read via an
-- anonymous overlay-side IRC connection, see functions/api/party/*.js)
-- or a player's own phone via a QR-code join link - see TODO.md for the
-- full design. Both paths call the same guess endpoint, which is why
-- there's no separate "how did they guess" table: player_name and
-- source are enough to tell the two apart on the scoreboard.
CREATE TABLE IF NOT EXISTS party_sessions (
  code           TEXT PRIMARY KEY,
  host_key       TEXT NOT NULL,
  twitch_channel TEXT,
  category       TEXT,
  target_slug    TEXT NOT NULL,
  shown_slugs    TEXT NOT NULL DEFAULT '[]', -- JSON array, every target shown this session so next() can avoid repeats
  shown          INTEGER NOT NULL DEFAULT 1,
  resolved       INTEGER NOT NULL DEFAULT 0,
  last_winner    TEXT,               -- who took the current round, for the "X got it!" line on the host tab and overlay
  round_no       INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
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
-- happened. Local/QR play only - Twitch chat isn't logged here, see
-- TODO.md and functions/api/party/guess.js for why.
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

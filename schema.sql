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

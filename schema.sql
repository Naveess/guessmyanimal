CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  animal     TEXT,
  kind       TEXT NOT NULL,
  message    TEXT NOT NULL,
  handled    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reports_open ON reports (handled, created_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  client_id TEXT,
  platform TEXT NOT NULL,
  version TEXT NOT NULL,
  from_version TEXT,
  channel TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS events_type_name_ts ON events (type, name, ts);

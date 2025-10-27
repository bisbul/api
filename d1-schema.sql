-- d1-schema.sql — Cloudflare D1 schema for MVCS SPA
-- Users for auth (simple demo)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  uid TEXT
);

-- Presensi records
CREATE TABLE IF NOT EXISTS presensi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  label TEXT,                -- matched display name if user_id not resolved
  score REAL,                -- similarity score (e.g., cosine)
  status TEXT DEFAULT 'hadir',
  lokasi TEXT,
  ts TEXT NOT NULL,          -- ISO timestamp
  meta TEXT,                 -- JSON (camera size, threshold, etc)
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Face embeddings / descriptors (LBP histogram in this demo)
CREATE TABLE IF NOT EXISTS faces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  label TEXT,              -- human label (fallback if user_id not set)
  vec TEXT NOT NULL,       -- JSON array of floats (length depends on method; 256 for LBP)
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_presensi_ts ON presensi(ts);
CREATE INDEX IF NOT EXISTS idx_faces_user ON faces(user_id);

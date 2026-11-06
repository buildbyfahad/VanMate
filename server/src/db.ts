import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  lang TEXT NOT NULL DEFAULT 'hi'
);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  shift TEXT NOT NULL CHECK (shift IN ('morning','afternoon')),
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,            -- 'HH:MM', when the van leaves for the first child
  days TEXT NOT NULL DEFAULT '1,2,3,4,5,6', -- JS weekday numbers, Sunday = 0
  auto INTEGER NOT NULL DEFAULT 1      -- 1 = calls start by themselves at start_time
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  child TEXT NOT NULL,
  parent TEXT NOT NULL,
  phone TEXT NOT NULL,
  fee INTEGER NOT NULL DEFAULT 0,
  offset_min INTEGER NOT NULL DEFAULT 0 -- call this many minutes after the route starts
);

CREATE TABLE IF NOT EXISTS absences (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY (student_id, date)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                  -- 'YYYY-MM-DD'
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  start_min INTEGER NOT NULL,          -- minutes after midnight the run starts
  delay_min INTEGER NOT NULL DEFAULT 0,
  UNIQUE (route_id, date)
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','calling','placed','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER,
  provider_sid TEXT,
  placed_at INTEGER,
  error TEXT,
  UNIQUE (run_id, student_id)
);
`;

export type Db = DatabaseSync;

export function openDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

import { randomUUID } from 'node:crypto';
import { Db } from './db.js';
import { Voice } from './voice.js';
import { atMinute, dateKey, minutesOfDay, parseHHMM } from './time.js';

/** A call that is more than this many minutes late is dropped: calling a parent at the wrong time is worse than not calling. */
export const STALE_MIN = 20;
export const MAX_ATTEMPTS = 3;
export const RETRY_MS = 60_000;

/** Create today's runs (and one pending call per child) for every automatic route. */
export function ensureRuns(db: Db, now: Date): void {
  const date = dateKey(now);
  const dow = String(now.getDay());
  const routes = db
    .prepare('SELECT id, start_time, days FROM routes WHERE auto = 1')
    .all() as { id: string; start_time: string; days: string }[];

  const insertRun = db.prepare('INSERT OR IGNORE INTO runs (id, route_id, date, start_min) VALUES (?, ?, ?, ?)');
  for (const r of routes) {
    if (!r.days.split(',').includes(dow)) continue;
    const start = parseHHMM(r.start_time);
    if (start === null) continue;
    insertRun.run(randomUUID(), r.id, date, start);
  }

  // Children added after the run was created still get their call.
  db.prepare(
    `INSERT OR IGNORE INTO calls (id, run_id, student_id)
     SELECT lower(hex(randomblob(16))), runs.id, students.id
     FROM runs JOIN students ON students.route_id = runs.route_id
     WHERE runs.date = ?`,
  ).run(date);
}

interface DueRow {
  id: string;
  attempts: number;
  student_id: string;
  child: string;
  parent: string;
  phone: string;
  offset_min: number;
  start_min: number;
  delay_min: number;
  driver: string;
  lang: 'hi' | 'en';
}

/** One pass of the scheduler: place every call that is due. Returns how many calls were placed. */
export async function tick(db: Db, voice: Voice, now: Date = new Date()): Promise<number> {
  ensureRuns(db, now);
  const date = dateKey(now);
  const nowMs = now.getTime();

  const rows = db
    .prepare(
      `SELECT c.id, c.attempts, c.student_id, s.child, s.parent, s.phone, s.offset_min,
              r.start_min, r.delay_min, d.name AS driver, d.lang
       FROM calls c
       JOIN runs r ON r.id = c.run_id
       JOIN students s ON s.id = c.student_id
       JOIN routes rt ON rt.id = r.route_id
       JOIN drivers d ON d.id = rt.driver_id
       WHERE r.date = ? AND r.status = 'scheduled' AND c.status = 'pending'
         AND (c.retry_at IS NULL OR c.retry_at <= ?)`,
    )
    .all(date, nowMs) as unknown as DueRow[];

  const setStatus = db.prepare('UPDATE calls SET status = ?, error = ? WHERE id = ?');
  const isAbsent = db.prepare('SELECT 1 FROM absences WHERE student_id = ? AND date = ?');
  let placed = 0;

  for (const row of rows) {
    const dueMs = atMinute(date, row.start_min + row.delay_min + row.offset_min).getTime();
    if (dueMs > nowMs) continue;

    if (isAbsent.get(row.student_id, date)) {
      setStatus.run('skipped', 'absent today', row.id);
      continue;
    }
    if (nowMs - dueMs > STALE_MIN * 60_000) {
      setStatus.run('skipped', 'too late to call', row.id);
      continue;
    }

    setStatus.run('calling', null, row.id); // claimed before the network call, so it can never be placed twice
    try {
      const { sid } = await voice.call({
        to: row.phone,
        parent: row.parent,
        child: row.child,
        driver: row.driver,
        lang: row.lang,
      });
      db.prepare("UPDATE calls SET status = 'placed', provider_sid = ?, placed_at = ?, error = NULL WHERE id = ?").run(
        sid,
        Date.now(),
        row.id,
      );
      placed++;
    } catch (e) {
      const attempts = row.attempts + 1;
      const msg = e instanceof Error ? e.message : String(e);
      if (attempts >= MAX_ATTEMPTS) {
        db.prepare("UPDATE calls SET status = 'failed', attempts = ?, error = ? WHERE id = ?").run(attempts, msg, row.id);
      } else {
        db.prepare("UPDATE calls SET status = 'pending', attempts = ?, retry_at = ?, error = ? WHERE id = ?").run(
          attempts,
          nowMs + RETRY_MS,
          msg,
          row.id,
        );
      }
    }
  }
  return placed;
}

/** "Start now": move the run so its next waiting call is due this minute. */
export function startNow(db: Db, runId: string, now: Date = new Date()): boolean {
  const run = db.prepare('SELECT id, start_min, delay_min FROM runs WHERE id = ?').get(runId) as
    | { id: string; start_min: number; delay_min: number }
    | undefined;
  if (!run) return false;
  const next = db
    .prepare(
      `SELECT MIN(s.offset_min) AS off FROM calls c JOIN students s ON s.id = c.student_id
       WHERE c.run_id = ? AND c.status = 'pending'`,
    )
    .get(runId) as { off: number | null };
  const off = next.off ?? 0;
  const delay = minutesOfDay(now) - run.start_min - off;
  db.prepare("UPDATE runs SET delay_min = ?, status = 'scheduled' WHERE id = ?").run(delay, runId);
  return true;
}

export function startScheduler(db: Db, voice: Voice, everyMs = 15_000): () => void {
  let busy = false;
  const loop = async () => {
    if (busy) return;
    busy = true;
    try {
      await tick(db, voice);
    } catch (e) {
      console.error('scheduler tick failed', e);
    } finally {
      busy = false;
    }
  };
  loop();
  const t = setInterval(loop, everyMs);
  return () => clearInterval(t);
}

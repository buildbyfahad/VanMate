import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID, randomBytes } from 'node:crypto';
import { Db } from './db.js';
import { Voice } from './voice.js';
import { atMinute, dateKey, formatHHMM, parseHHMM } from './time.js';
import { ensureRuns, startNow } from './scheduler.js';

export const MAX_ROUTES_PER_SHIFT = 5;

interface Driver {
  id: string;
  name: string;
  phone: string;
  lang: 'hi' | 'en';
}

const normalizePhone = (raw: string) => {
  const d = String(raw).replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
  return d;
};

export function buildApp(db: Db, _voice: Voice, clock: () => Date = () => new Date()) {
  const app = Fastify({ logger: false });

  const bad = (reply: FastifyReply, error: string, code = 400) => reply.code(code).send({ error });

  async function auth(req: FastifyRequest, reply: FastifyReply): Promise<Driver | null> {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const d = token
      ? (db.prepare('SELECT id, name, phone, lang FROM drivers WHERE token = ?').get(token) as Driver | undefined)
      : undefined;
    if (!d) {
      bad(reply, 'Please sign in again.', 401);
      return null;
    }
    return d;
  }

  const ownsRoute = (driverId: string, routeId: string) =>
    !!db.prepare('SELECT 1 FROM routes WHERE id = ? AND driver_id = ?').get(routeId, driverId);
  const ownsStudent = (driverId: string, studentId: string) =>
    !!db
      .prepare('SELECT 1 FROM students s JOIN routes r ON r.id = s.route_id WHERE s.id = ? AND r.driver_id = ?')
      .get(studentId, driverId);
  const ownsRun = (driverId: string, runId: string) =>
    !!db
      .prepare('SELECT 1 FROM runs u JOIN routes r ON r.id = u.route_id WHERE u.id = ? AND r.driver_id = ?')
      .get(runId, driverId);

  app.get('/health', async () => ({ ok: true }));

  app.post('/drivers', async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; phone?: string; lang?: string };
    if (!b.name?.trim()) return bad(reply, 'Enter your name.');
    const phone = normalizePhone(b.phone ?? '');
    if (phone.length < 10) return bad(reply, 'Enter a valid mobile number.');
    const id = randomUUID();
    const token = randomBytes(24).toString('hex');
    db.prepare('INSERT INTO drivers (id, name, phone, token, lang) VALUES (?, ?, ?, ?, ?)').run(
      id,
      b.name.trim(),
      phone,
      token,
      b.lang === 'en' ? 'en' : 'hi',
    );
    return { id, token };
  });

  app.patch('/me', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const b = (req.body ?? {}) as { name?: string; lang?: string };
    if (b.name?.trim()) db.prepare('UPDATE drivers SET name = ? WHERE id = ?').run(b.name.trim(), me.id);
    if (b.lang === 'hi' || b.lang === 'en') db.prepare('UPDATE drivers SET lang = ? WHERE id = ?').run(b.lang, me.id);
    return db.prepare('SELECT id, name, phone, lang FROM drivers WHERE id = ?').get(me.id);
  });

  // ---- routes & children ----

  app.get('/routes', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const routes = db
      .prepare('SELECT id, shift, name, start_time, days, auto FROM routes WHERE driver_id = ? ORDER BY shift, start_time')
      .all(me.id) as { id: string }[];
    const kids = db
      .prepare(
        `SELECT s.id, s.route_id, s.child, s.parent, s.phone, s.fee, s.offset_min
         FROM students s JOIN routes r ON r.id = s.route_id WHERE r.driver_id = ? ORDER BY s.offset_min, s.child`,
      )
      .all(me.id) as { route_id: string }[];
    return routes.map((r) => ({ ...r, students: kids.filter((k) => k.route_id === r.id) }));
  });

  app.post('/routes', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const b = (req.body ?? {}) as { shift?: string; name?: string; start_time?: string };
    if (b.shift !== 'morning' && b.shift !== 'afternoon') return bad(reply, 'Choose morning or afternoon.');
    if (!b.name?.trim()) return bad(reply, 'Give the route a name.');
    if (parseHHMM(b.start_time ?? '') === null) return bad(reply, 'Start time must look like 06:30.');
    const count = (db.prepare('SELECT COUNT(*) AS n FROM routes WHERE driver_id = ? AND shift = ?').get(me.id, b.shift) as { n: number }).n;
    if (count >= MAX_ROUTES_PER_SHIFT) return bad(reply, `A shift can have at most ${MAX_ROUTES_PER_SHIFT} routes.`, 422);
    const id = randomUUID();
    db.prepare('INSERT INTO routes (id, driver_id, shift, name, start_time) VALUES (?, ?, ?, ?, ?)').run(
      id,
      me.id,
      b.shift,
      b.name.trim(),
      formatHHMM(parseHHMM(b.start_time!)!),
    );
    return { id };
  });

  app.patch('/routes/:id', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const { id } = req.params as { id: string };
    if (!ownsRoute(me.id, id)) return bad(reply, 'Route not found.', 404);
    const b = (req.body ?? {}) as { name?: string; start_time?: string; auto?: boolean };
    if (b.name?.trim()) db.prepare('UPDATE routes SET name = ? WHERE id = ?').run(b.name.trim(), id);
    if (b.auto !== undefined) db.prepare('UPDATE routes SET auto = ? WHERE id = ?').run(b.auto ? 1 : 0, id);
    if (b.start_time !== undefined) {
      const min = parseHHMM(b.start_time);
      if (min === null) return bad(reply, 'Start time must look like 06:30.');
      db.prepare('UPDATE routes SET start_time = ? WHERE id = ?').run(formatHHMM(min), id);
      // Today's run follows the new time unless a call has already gone out.
      db.prepare(
        `UPDATE runs SET start_min = ? WHERE route_id = ? AND date = ? AND status = 'scheduled'
         AND NOT EXISTS (SELECT 1 FROM calls WHERE run_id = runs.id AND status IN ('placed','calling'))`,
      ).run(min, id, dateKey(clock()));
    }
    return { ok: true };
  });

  app.delete('/routes/:id', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const { id } = req.params as { id: string };
    if (!ownsRoute(me.id, id)) return bad(reply, 'Route not found.', 404);
    db.prepare('DELETE FROM routes WHERE id = ?').run(id);
    return { ok: true };
  });

  app.post('/routes/:id/students', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const { id } = req.params as { id: string };
    if (!ownsRoute(me.id, id)) return bad(reply, 'Route not found.', 404);
    const b = (req.body ?? {}) as { child?: string; parent?: string; phone?: string; fee?: number; offset_min?: number };
    if (!b.child?.trim() || !b.parent?.trim()) return bad(reply, "Enter the child's and parent's name.");
    const phone = normalizePhone(b.phone ?? '');
    if (phone.length < 10) return bad(reply, 'Enter a valid mobile number.');
    const offset = Number.isFinite(b.offset_min) ? Math.max(0, Math.round(b.offset_min!)) : 0;
    const sid = randomUUID();
    db.prepare('INSERT INTO students (id, route_id, child, parent, phone, fee, offset_min) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      sid,
      id,
      b.child.trim(),
      b.parent.trim(),
      phone,
      Math.max(0, Math.round(Number(b.fee) || 0)),
      offset,
    );
    return { id: sid };
  });

  app.patch('/students/:id', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const { id } = req.params as { id: string };
    if (!ownsStudent(me.id, id)) return bad(reply, 'Child not found.', 404);
    const b = (req.body ?? {}) as { child?: string; parent?: string; phone?: string; fee?: number; offset_min?: number };
    if (b.child?.trim()) db.prepare('UPDATE students SET child = ? WHERE id = ?').run(b.child.trim(), id);
    if (b.parent?.trim()) db.prepare('UPDATE students SET parent = ? WHERE id = ?').run(b.parent.trim(), id);
    if (b.phone !== undefined) {
      const phone = normalizePhone(b.phone);
      if (phone.length < 10) return bad(reply, 'Enter a valid mobile number.');
      db.prepare('UPDATE students SET phone = ? WHERE id = ?').run(phone, id);
    }
    if (b.fee !== undefined) db.prepare('UPDATE students SET fee = ? WHERE id = ?').run(Math.max(0, Math.round(Number(b.fee) || 0)), id);
    if (b.offset_min !== undefined) db.prepare('UPDATE students SET offset_min = ? WHERE id = ?').run(Math.max(0, Math.round(Number(b.offset_min) || 0)), id);
    return { ok: true };
  });

  app.delete('/students/:id', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const { id } = req.params as { id: string };
    if (!ownsStudent(me.id, id)) return bad(reply, 'Child not found.', 404);
    db.prepare('DELETE FROM students WHERE id = ?').run(id);
    return { ok: true };
  });

  app.put('/students/:id/absent/:date', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const { id, date } = req.params as { id: string; date: string };
    if (!ownsStudent(me.id, id)) return bad(reply, 'Child not found.', 404);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad(reply, 'Bad date.');
    const absent = (req.body as { absent?: boolean } | null)?.absent !== false;
    if (absent) db.prepare('INSERT OR IGNORE INTO absences (student_id, date) VALUES (?, ?)').run(id, date);
    else db.prepare('DELETE FROM absences WHERE student_id = ? AND date = ?').run(id, date);
    return { ok: true };
  });

  // ---- today ----

  app.get('/today', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const now = clock();
    ensureRuns(db, now);
    const date = dateKey(now);
    const runs = db
      .prepare(
        `SELECT u.id, u.status, u.start_min, u.delay_min, r.id AS route_id, r.name, r.shift, r.start_time
         FROM runs u JOIN routes r ON r.id = u.route_id
         WHERE r.driver_id = ? AND u.date = ? ORDER BY r.shift DESC, u.start_min`,
      )
      .all(me.id, date) as { id: string; start_min: number; delay_min: number }[];

    const calls = db
      .prepare(
        `SELECT c.id, c.run_id, c.status, c.error, c.placed_at, s.id AS student_id, s.child, s.parent, s.phone, s.offset_min,
                EXISTS (SELECT 1 FROM absences a WHERE a.student_id = s.id AND a.date = ?) AS absent
         FROM calls c JOIN students s ON s.id = c.student_id
         JOIN runs u ON u.id = c.run_id JOIN routes r ON r.id = u.route_id
         WHERE r.driver_id = ? AND u.date = ? ORDER BY s.offset_min, s.child`,
      )
      .all(date, me.id, date) as { run_id: string; offset_min: number; absent: number }[];

    return {
      date,
      runs: runs.map((u) => ({
        ...u,
        calls: calls
          .filter((c) => c.run_id === u.id)
          .map((c) => ({
            ...c,
            absent: !!c.absent,
            due_at: atMinute(date, u.start_min + u.delay_min + c.offset_min).getTime(),
          })),
      })),
    };
  });

  app.post('/runs/:id/start-now', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const { id } = req.params as { id: string };
    if (!ownsRun(me.id, id)) return bad(reply, 'Run not found.', 404);
    startNow(db, id, clock());
    return { ok: true };
  });

  app.post('/runs/:id/delay', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const { id } = req.params as { id: string };
    if (!ownsRun(me.id, id)) return bad(reply, 'Run not found.', 404);
    const minutes = Math.round(Number((req.body as { minutes?: number } | null)?.minutes));
    if (!Number.isFinite(minutes) || Math.abs(minutes) > 180) return bad(reply, 'Choose between -180 and 180 minutes.');
    db.prepare('UPDATE runs SET delay_min = delay_min + ? WHERE id = ?').run(minutes, id);
    return { ok: true };
  });

  app.post('/runs/:id/cancel', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const { id } = req.params as { id: string };
    if (!ownsRun(me.id, id)) return bad(reply, 'Run not found.', 404);
    db.prepare("UPDATE runs SET status = 'cancelled' WHERE id = ?").run(id);
    return { ok: true };
  });

  app.post('/runs/:id/resume', async (req, reply) => {
    const me = await auth(req, reply);
    if (!me) return;
    const { id } = req.params as { id: string };
    if (!ownsRun(me.id, id)) return bad(reply, 'Run not found.', 404);
    db.prepare("UPDATE runs SET status = 'scheduled' WHERE id = ?").run(id);
    return { ok: true };
  });

  return app;
}

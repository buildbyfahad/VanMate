import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, Db } from './db.js';
import { MockVoice } from './voice.js';
import { buildApp } from './app.js';
import { tick, STALE_MIN } from './scheduler.js';

// Fixed weekday: Friday 6 Nov 2026 (weekday number 5, so it is a school day).
const at = (hh: number, mm: number, ss = 0) => new Date(2026, 10, 6, hh, mm, ss);

async function setup(clockNow = at(6, 0)) {
  const db: Db = openDb();
  const voice = new MockVoice();
  let now = clockNow;
  const app = buildApp(db, voice, () => now);
  const call = async (method: string, url: string, token?: string, payload?: unknown) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as object | undefined,
    });
    return { status: res.statusCode, body: res.json() as any };
  };
  const { body: drv } = await call('POST', '/drivers', undefined, { name: 'Ramesh', phone: '9876543210' });
  const token: string = drv.token;
  const { body: route } = await call('POST', '/routes', token, { shift: 'morning', name: 'Route 1', start_time: '06:30' });
  const kids: string[] = [];
  for (const [child, parent, offset] of [['Aarav', 'Sunita', 0], ['Riya', 'Manoj', 6], ['Kabir', 'Pooja', 12]] as const) {
    const { body } = await call('POST', `/routes/${route.id}/students`, token, {
      child, parent, phone: '9811111111', fee: 800, offset_min: offset,
    });
    kids.push(body.id);
  }
  return { db, voice, app, call, token, routeId: route.id as string, kids, setNow: (d: Date) => (now = d) };
}

test('calls go out by themselves at the scheduled times', async () => {
  const t = await setup();
  assert.equal(await tick(t.db, t.voice, at(6, 29)), 0, 'nothing before the start time');
  assert.equal(await tick(t.db, t.voice, at(6, 30)), 1, 'first parent at 06:30');
  assert.equal(t.voice.calls[0].child, 'Aarav');
  assert.equal(await tick(t.db, t.voice, at(6, 30, 30)), 0, 'never calls the same parent twice');
  assert.equal(await tick(t.db, t.voice, at(6, 36)), 1, 'second parent at 06:36');
  assert.equal(await tick(t.db, t.voice, at(6, 42)), 1, 'third parent at 06:42');
  assert.deepEqual(t.voice.calls.map((c) => c.child), ['Aarav', 'Riya', 'Kabir']);
  assert.equal(t.voice.calls[0].to, '919811111111');
});

test('an absent child is skipped, not called', async () => {
  const t = await setup();
  await t.call('PUT', `/students/${t.kids[1]}/absent/2026-11-06`, t.token, { absent: true });
  await tick(t.db, t.voice, at(6, 30));
  await tick(t.db, t.voice, at(6, 36));
  await tick(t.db, t.voice, at(6, 42));
  assert.deepEqual(t.voice.calls.map((c) => c.child), ['Aarav', 'Kabir']);
  const { body } = await t.call('GET', '/today', t.token);
  const riya = body.runs[0].calls.find((c: any) => c.child === 'Riya');
  assert.equal(riya.status, 'skipped');
});

test('delay pushes every call later; start-now brings the next call to now', async () => {
  const t = await setup();
  await tick(t.db, t.voice, at(6, 30));
  const { body } = await t.call('GET', '/today', t.token);
  const runId = body.runs[0].id;

  await t.call('POST', `/runs/${runId}/delay`, t.token, { minutes: 10 });
  assert.equal(await tick(t.db, t.voice, at(6, 36)), 0, 'delayed: 06:36 call now due at 06:46');
  assert.equal(await tick(t.db, t.voice, at(6, 46)), 1);

  t.setNow(at(6, 47));
  await t.call('POST', `/runs/${runId}/start-now`, t.token);
  assert.equal(await tick(t.db, t.voice, at(6, 47)), 1, 'start-now: next parent called immediately');
  assert.deepEqual(t.voice.calls.map((c) => c.child), ['Aarav', 'Riya', 'Kabir']);
});

test('a cancelled run places no calls and can be resumed', async () => {
  const t = await setup();
  await tick(t.db, t.voice, at(6, 0));
  const { body } = await t.call('GET', '/today', t.token);
  const runId = body.runs[0].id;
  await t.call('POST', `/runs/${runId}/cancel`, t.token);
  assert.equal(await tick(t.db, t.voice, at(6, 30)), 0);
  await t.call('POST', `/runs/${runId}/resume`, t.token);
  assert.equal(await tick(t.db, t.voice, at(6, 31)), 1);
});

test('after downtime, very late calls are dropped instead of made at the wrong time', async () => {
  const t = await setup();
  await tick(t.db, t.voice, at(6, 0));
  // 06:57: Aarav (due 06:30) is 27 min late and Riya (06:36) is 21 min late: both dropped. Kabir (06:42) is 15 min late: still timely.
  assert.ok(57 - 36 > STALE_MIN && 57 - 42 <= STALE_MIN);
  assert.equal(await tick(t.db, t.voice, at(6, 57)), 1, 'only the call that is still timely');
  const { body } = await t.call('GET', '/today', t.token);
  const status = Object.fromEntries(body.runs[0].calls.map((c: any) => [c.child, c.status]));
  assert.equal(status.Aarav, 'skipped');
  assert.equal(status.Riya, 'skipped');
  assert.equal(status.Kabir, 'placed');
});

test('a failed call is retried, then given up after 3 attempts', async () => {
  const t = await setup();
  t.voice.failNext = 1;
  assert.equal(await tick(t.db, t.voice, at(6, 30)), 0);
  assert.equal(await tick(t.db, t.voice, at(6, 30, 30)), 0, 'waits before retrying');
  assert.equal(await tick(t.db, t.voice, at(6, 31, 5)), 1, 'retry succeeds');

  t.voice.failNext = 5;
  await tick(t.db, t.voice, at(6, 36));
  await tick(t.db, t.voice, at(6, 37, 5));
  await tick(t.db, t.voice, at(6, 38, 10));
  const { body } = await t.call('GET', '/today', t.token);
  assert.equal(body.runs[0].calls.find((c: any) => c.child === 'Riya').status, 'failed');
});

test('a shift holds at most 5 routes; the other shift is separate', async () => {
  const t = await setup();
  for (let i = 2; i <= 5; i++) {
    const r = await t.call('POST', '/routes', t.token, { shift: 'morning', name: `Route ${i}`, start_time: '07:00' });
    assert.equal(r.status, 200);
  }
  const sixth = await t.call('POST', '/routes', t.token, { shift: 'morning', name: 'Route 6', start_time: '08:00' });
  assert.equal(sixth.status, 422);
  const afternoon = await t.call('POST', '/routes', t.token, { shift: 'afternoon', name: 'PM 1', start_time: '12:30' });
  assert.equal(afternoon.status, 200);
});

test("one driver cannot see or change another driver's data", async () => {
  const t = await setup();
  const { body: other } = await t.call('POST', '/drivers', undefined, { name: 'Suresh', phone: '9000000001' });
  assert.equal((await t.call('GET', '/routes', other.token)).body.length, 0);
  assert.equal((await t.call('DELETE', `/students/${t.kids[0]}`, other.token)).status, 404);
  assert.equal((await t.call('GET', '/routes')).status, 401);
});

test('no run is created on a day the route does not run (Sunday)', async () => {
  const t = await setup();
  const sunday = new Date(2026, 10, 8, 6, 30);
  assert.equal(await tick(t.db, t.voice, sunday), 0);
  assert.equal(t.voice.calls.length, 0);
});

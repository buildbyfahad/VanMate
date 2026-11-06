import test from 'node:test';
import assert from 'node:assert/strict';
import { allNumbers, buildPlan, callKey, offsets, runKey, runsForDate, startedAtFor } from './plan';
import { Data } from './types';

// Friday 6 Nov 2026 is weekday 5.
const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m);

function base(): Data {
  return {
    settings: { driver: 'Ramesh', upi: '', lang: 'hi' },
    routes: [
      { id: 'r1', name: 'Route 1', days: [1, 2, 3, 4, 5, 6] },
      { id: 'r2', name: 'Route 2', days: [1, 2, 3, 4, 5, 6] },
    ],
    students: [
      { id: 'a', routeId: 'r1', child: 'Aarav', parent: 'Sunita', phone: '919800000001', fee: 800, order: 0, gapMin: 0 },
      { id: 'b', routeId: 'r1', child: 'Riya', parent: 'Manoj', phone: '919800000002', fee: 800, order: 1, gapMin: 9 },
      { id: 'c', routeId: 'r2', child: 'Kabir', parent: 'Pooja', phone: '919800000003', fee: 800, order: 0, gapMin: 0 },
    ],
    absences: {},
    started: {},
    cancelled: {},
    payments: {},
  };
}

const mins = (ms: number) => new Date(ms).getHours() * 60 + new Date(ms).getMinutes();

test('nothing is called until the driver starts a route', () => {
  assert.equal(buildPlan(base(), at(6, 6, 0)).length, 0);
  const run = runsForDate(base(), '2026-11-06')[0];
  assert.equal(run.startedAt, null);
  assert.equal(run.calls[0].at, null);
});

test('after Start the first student is called at once and the rest follow by their gaps', () => {
  const d = base();
  d.started[runKey('2026-11-06', 'r1')] = at(6, 6, 40).getTime(); // driver taps Start at 06:40
  const plan = buildPlan(d, at(6, 6, 40));
  assert.deepEqual(plan.map((p) => [p.key, mins(p.at)]), [
    ['2026-11-06|a', 6 * 60 + 40],
    ['2026-11-06|b', 6 * 60 + 49],
  ]);
});

test('the gap is from the previous student, so changing the order changes the times', () => {
  const d = base();
  d.students[0].gapMin = 4; // ignored: he is first
  d.students[1].gapMin = 9;
  assert.deepEqual(offsets([d.students[0], d.students[1], { gapMin: 3 }]), [0, 9, 12]);
  d.started[runKey('2026-11-06', 'r1')] = at(6, 6, 40).getTime();
  // Drag Riya to the top: she is now called at once and Aarav 4 minutes later.
  d.students[1].order = 0;
  d.students[0].order = 1;
  d.students[0].gapMin = 4;
  const calls = runsForDate(d, '2026-11-06')[0].calls;
  assert.deepEqual(calls.map((c) => [c.student.id, c.offsetMin]), [['b', 0], ['a', 4]]);
});

test('routes are independent, and an absent child or a stopped run makes no call', () => {
  const d = base();
  d.started[runKey('2026-11-06', 'r1')] = at(6, 6, 40).getTime();
  d.started[runKey('2026-11-06', 'r2')] = at(6, 7, 0).getTime();
  d.absences['2026-11-06'] = ['b'];
  assert.deepEqual(buildPlan(d, at(6, 6, 40)).map((p) => p.key), ['2026-11-06|a', '2026-11-06|c']);
  d.cancelled[runKey('2026-11-06', 'r2')] = true;
  assert.deepEqual(buildPlan(d, at(6, 6, 40)).map((p) => p.key), ['2026-11-06|a']);
});

test('a route that does not run on that weekday has no run', () => {
  const d = base();
  d.routes[0].days = [1, 2, 3];
  assert.deepEqual(runsForDate(d, '2026-11-06').map((r) => r.route.id), ['r2']); // Friday
});

test('rings that are long past are not planned', () => {
  const d = base();
  d.started[runKey('2026-11-06', 'r1')] = at(6, 6, 0).getTime();
  const plan = buildPlan(d, at(6, 7, 0)); // an hour later: both rings are stale
  assert.equal(plan.length, 0);
});

test('starting again after some parents were called rings the next waiting parent now', () => {
  const d = base();
  d.started[runKey('2026-11-06', 'r1')] = at(6, 6, 0).getTime();
  const run = runsForDate(d, '2026-11-06')[0];
  const now = at(6, 6, 30).getTime();
  assert.equal(startedAtFor(run, new Set(), now), now); // fresh start: from now
  const restart = startedAtFor(run, new Set([callKey('2026-11-06', 'a')]), now); // Aarav done, Riya waits (offset 9)
  assert.equal(restart + 9 * 60_000, now);
});

test('a child with extra numbers gets one call per number, never the same number twice', () => {
  const d = base();
  d.students[0] = { ...d.students[0], extraPhones: ['919800000099', '919800000001'] };
  d.started[runKey('2026-11-06', 'r1')] = at(6, 6, 0).getTime();
  assert.deepEqual(allNumbers(d.students[0]), ['919800000001', '919800000099']);
  const mine = buildPlan(d, at(6, 6, 0)).filter((p) => p.key.startsWith('2026-11-06|a'));
  assert.deepEqual(mine.map((p) => [p.key, p.number]), [
    ['2026-11-06|a', '+919800000001'],
    ['2026-11-06|a#1', '+919800000099'],
  ]);
  assert.equal(mine[0].at, mine[1].at);
});

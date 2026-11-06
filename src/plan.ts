import { Data, Route, Student } from './types';

/** Same rule as the native side: a ring more than this late is dropped. */
export const STALE_MIN = 20;

export interface PlanEntry {
  key: string; // `${date}|${studentId}`
  at: number; // epoch ms
  number: string; // +91...
}

export const runKey = (date: string, routeId: string) => `${date}|${routeId}`;
export const callKey = (date: string, studentId: string) => `${date}|${studentId}`;

export function weekdayOf(date: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d).getDay();
}

/** Key for the i-th number of a child's call (0 = main number). */
export const numberKey = (key: string, i: number) => (i === 0 ? key : `${key}#${i}`);

/** Every number to call for a child: the main one, then extras, without repeats. */
export const allNumbers = (s: Pick<Student, 'phone' | 'extraPhones'>) => [...new Set([s.phone, ...(s.extraPhones ?? [])])];

export interface PlannedCall {
  key: string;
  /** One key per number to call: the main number first, then any extra numbers. */
  keys: string[];
  student: Student;
  offsetMin: number; // minutes after the driver starts the route at which this student is called (0 for the first)
  at: number | null; // epoch ms the phone should call; null until the driver starts the route
  absent: boolean;
}

export interface PlannedRun {
  route: Route;
  date: string;
  startedAt: number | null; // epoch ms the driver started it, null if not started yet
  cancelled: boolean; // stopped by the driver
  calls: PlannedCall[];
}

/** A route's students in calling order. */
export const sortedKids = (data: Data, routeId: string) =>
  data.students.filter((s) => s.routeId === routeId).sort((a, b) => a.order - b.order || a.child.localeCompare(b.child));

/** Minutes after the start at which each student of a route (in order) is called: the first at once, then each gap after the previous. */
export function offsets(kids: Pick<Student, 'gapMin'>[]): number[] {
  let t = 0;
  return kids.map((k, i) => (i === 0 ? 0 : (t += Math.max(0, k.gapMin))));
}

/** Every route that runs on `date`, with call times filled in once the driver has started it. */
export function runsForDate(data: Data, date: string): PlannedRun[] {
  const dow = weekdayOf(date);
  const absent = new Set(data.absences[date] ?? []);
  return data.routes
    .filter((route) => route.days.includes(dow))
    .map((route) => {
      const startedAt = data.started[runKey(date, route.id)] ?? null;
      return {
        route,
        date,
        startedAt,
        cancelled: !!data.cancelled[runKey(date, route.id)],
        calls: (() => {
          const kids = sortedKids(data, route.id);
          const offs = offsets(kids);
          return kids.map((student, i) => ({
            key: callKey(date, student.id),
            keys: allNumbers(student).map((_, n) => numberKey(callKey(date, student.id), n)),
            student,
            offsetMin: offs[i],
            at: startedAt === null ? null : startedAt + offs[i] * 60_000,
            absent: absent.has(student.id),
          }));
        })(),
      };
    });
}

/** The list of rings handed to the phone's alarm engine: today's routes that the driver has started. */
export function buildPlan(data: Data, now: Date): PlanEntry[] {
  const d = now;
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const out: PlanEntry[] = [];
  for (const run of runsForDate(data, today)) {
    if (run.cancelled || run.startedAt === null) continue;
    for (const c of run.calls) {
      if (c.absent || c.at === null) continue;
      if (c.at < now.getTime() - STALE_MIN * 60_000) continue;
      allNumbers(c.student).forEach((n, i) => out.push({ key: numberKey(c.key, i), at: c.at!, number: `+${n}` }));
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * The moment to record as "started" when the driver taps Start.
 * Fresh run: now. Starting again after some parents were already called: the next waiting parent is called now.
 */
export function startedAtFor(run: PlannedRun, doneKeys: Set<string>, now: number): number {
  const anyDone = run.calls.some((c) => doneKeys.has(c.key));
  if (!anyDone) return now;
  const waiting = run.calls.filter((c) => !c.absent && !doneKeys.has(c.key));
  const first = waiting.length ? Math.min(...waiting.map((c) => c.offsetMin)) : 0;
  return now - first * 60_000;
}

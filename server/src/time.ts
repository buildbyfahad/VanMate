const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date, e.g. 2026-11-06. The server runs with TZ=Asia/Kolkata. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'HH:MM' -> minutes after midnight, or null if invalid. */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatHHMM(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** The moment `minutes` after local midnight of `date`. */
export function atMinute(date: string, minutes: number): Date {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, 0, minutes, 0, 0);
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

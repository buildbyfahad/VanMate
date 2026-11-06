import { useEffect, useState } from 'react';

/** The current time in ms, refreshed every `everyMs`, so countdowns and statuses stay true on screen. */
export function useNow(everyMs = 15_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

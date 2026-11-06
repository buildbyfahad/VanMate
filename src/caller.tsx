import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { autoCallSupported, LogEntry, Sim, VanCaller } from '../modules/van-caller/src/VanCallerModule';
import { buildPlan } from './plan';
import { useStore } from './store';

interface Caller {
  supported: boolean; // Android with the native module
  permissionsOk: boolean;
  /** Last result for each key (`${date}|${studentId}`) that the phone actually dialled. */
  log: Record<string, LogEntry>;
  nextRingAt: number; // epoch ms of the next booked ring, 0 if none
  /** SIM cards that can place calls (only filled in once calling is allowed). */
  sims: Sim[];
  /** Whether the app may read the call history, which tells it if a parent answered and for how long. */
  callLogOk: boolean;
  requestCallLog: () => Promise<boolean>;
  chooseSim: (id: string) => void;
  requestPermissions: () => Promise<boolean>;
}

const Ctx = createContext<Caller | null>(null);

export function CallerProvider({ children }: { children: ReactNode }) {
  const { data, ready } = useStore();
  const [permissionsOk, setPermissionsOk] = useState(false);
  const [log, setLog] = useState<Record<string, LogEntry>>({});
  const [nextRingAt, setNextRingAt] = useState(0);
  const [sims, setSims] = useState<Sim[]>([]);
  const [callLogOk, setCallLogOk] = useState(false);

  // Always read the newest data. A listener created once would otherwise keep using the empty data from
  // before the saved routes had loaded, and overwrite the phone's real schedule with an empty one.
  const latest = useRef({ data, ready });
  latest.current = { data, ready };

  const refresh = useCallback(() => {
    if (!autoCallSupported) return;
    setPermissionsOk(VanCaller.hasPermissions());
    setCallLogOk(VanCaller.hasCallLogPermission());
    const byKey: Record<string, LogEntry> = {};
    for (const e of VanCaller.getLog()) byKey[e.key] = e; // later entries win
    setLog(byKey);
    setNextRingAt(VanCaller.nextAlarmAt());
    setSims(VanCaller.getSims());
  }, []);

  /** Give the phone the current schedule. Does nothing until the saved data has loaded. */
  const syncPlan = useCallback(() => {
    const { data: d, ready: r } = latest.current;
    if (!r || !autoCallSupported) return;
    VanCaller.setPlan(buildPlan(d, new Date()));
    refresh();
  }, [refresh]);

  // Hand the phone its schedule whenever routes, students, absences or delays change.
  // The phone's alarms then call parents on time even if this app is closed.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(syncPlan, 300);
    return () => clearTimeout(t);
  }, [ready, data.routes, data.students, data.absences, data.started, data.cancelled, syncPlan]);

  // Keep what is on screen true: poll while open, and again whenever the app returns to the front.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncPlan(); // also pushes the 7-day horizon forward each day
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [refresh, syncPlan]);

  const chooseSim = useCallback((id: string) => {
    VanCaller.setSim(id);
    setSims(VanCaller.getSims());
  }, []);

  const requestCallLog = useCallback(async () => {
    if (Platform.OS !== 'android') return false;
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG);
    const ok = res === PermissionsAndroid.RESULTS.GRANTED;
    setCallLogOk(ok);
    return ok;
  }, []);

  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') return false;
    const res = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CALL_PHONE,
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    ]);
    const ok = Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    syncPlan();
    return ok;
  }, [syncPlan]);

  const value = useMemo(
    () => ({ supported: autoCallSupported, permissionsOk, log, nextRingAt, sims, callLogOk, requestCallLog, chooseSim, requestPermissions }),
    [permissionsOk, log, nextRingAt, sims, callLogOk, requestCallLog, chooseSim, requestPermissions],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCaller(): Caller {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCaller must be used inside CallerProvider');
  return c;
}

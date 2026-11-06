import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Data, Payment, Route, Student } from './types';
import { allNumbers, runKey } from './plan';
import { normalizePhone } from './phone';

const KEY = 'vanmate:v3';

const emptyData = (): Data => ({
  settings: { driver: '', upi: '', lang: 'hi' },
  routes: [],
  students: [],
  absences: {},
  started: {},
  cancelled: {},
  payments: {},
});

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Returns an error message to show, or null on success. */
type Result = string | null;

export interface StudentInput {
  child: string;
  parent: string;
  phones: string[]; // as typed or picked; the first is the main number
  fee: number;
  gapMin: number; // minutes after the previous student
}

const MAX_NUMBERS = 3;

/** Checks a student's details and returns the cleaned-up fields, or an error message to show. */
function cleanStudent(s: StudentInput): { error: string } | { fields: Omit<Student, 'id' | 'routeId' | 'order'> } {
  if (!s.child.trim()) return { error: "Enter the student's name." };
  const phones = [...new Set(s.phones.map(normalizePhone).filter((p) => p.length >= 10))].slice(0, MAX_NUMBERS);
  if (phones.length === 0) return { error: "Add the parent's phone number." };
  return {
    fields: {
      child: s.child.trim(),
      parent: s.parent.trim() || 'Parent',
      phone: phones[0],
      extraPhones: phones.slice(1),
      fee: Math.max(0, Math.round(s.fee) || 0),
      gapMin: Math.min(120, Math.max(0, Math.round(s.gapMin) || 0)),
    },
  };
}

type OldStudent = Student & { arriveMin?: number; leadMin?: number; offsetMin?: number };

function migrateStudents(list: OldStudent[]): Student[] {
  const out: Student[] = [];
  const routes = [...new Set(list.map((s) => s.routeId))];
  for (const routeId of routes) {
    const kids = list.filter((s) => s.routeId === routeId);
    const callAt = (s: OldStudent) => Math.max(0, (s.arriveMin ?? s.offsetMin ?? 0) - (s.leadMin ?? 0));
    const sorted = kids[0] && kids.every((k) => k.order !== undefined) ? [...kids].sort((a, b) => a.order - b.order) : [...kids].sort((a, b) => callAt(a) - callAt(b));
    sorted.forEach((k, i) => {
      const { arriveMin: _a, leadMin: _l, offsetMin: _o, ...rest } = k;
      const gap = k.order !== undefined && k.gapMin !== undefined ? k.gapMin : i === 0 ? 0 : Math.max(0, callAt(k) - callAt(sorted[i - 1]));
      out.push({ ...rest, order: i, gapMin: gap });
    });
  }
  return out;
}

/** A student of this route who already has one of these numbers, if any. */
function duplicateIn(students: Student[], routeId: string, phones: string[], exceptId?: string): Student | undefined {
  const mine = new Set(phones.map(normalizePhone));
  return students.find((s) => s.routeId === routeId && s.id !== exceptId && allNumbers(s).some((n) => mine.has(n)));
}

const dupMessage = (who: string) => `${who} already has that number in this route.`;

interface Store {
  data: Data;
  ready: boolean;
  update: (fn: (d: Data) => Data) => void;
  setSettings: (patch: Partial<Data['settings']>) => void;
  /** Creates a route together with its first students. A route cannot exist without at least one student. */
  addRouteWithChildren: (route: { name: string; days: number[] }, children: StudentInput[]) => Result;
  patchRoute: (id: string, patch: Partial<Pick<Route, 'name' | 'days'>>) => Result;
  removeRoute: (id: string) => void;
  addStudent: (routeId: string, s: StudentInput) => Result;
  updateStudent: (id: string, s: StudentInput) => Result;
  removeStudent: (id: string) => void;
  /** Put a route's students in a new calling order (ids, first to last). */
  reorderStudents: (routeId: string, ids: string[]) => void;
  setAbsent: (studentId: string, date: string, absent: boolean) => void;
  startRun: (date: string, routeId: string, startedAt: number) => void;
  setCancelled: (date: string, routeId: string, cancelled: boolean) => void;
  markPaid: (id: string, month: string, mode: Payment['mode']) => void;
  undoPaid: (id: string, month: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(emptyData);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);
  const latest = useRef(data); // validation reads the newest data without waiting for a re-render
  latest.current = data;

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<Data>;
        const base = emptyData();
        const merged = { ...base, ...saved, settings: { ...base.settings, ...saved.settings }, started: saved.started ?? {} };
        // Older saves gave each student a time after the start (and a lead). They become an order plus a gap after the previous student.
        merged.students = migrateStudents(merged.students as unknown as OldStudent[]);
        setData(merged);
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return; // never overwrite saved data with the empty default
    AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
  }, [data]);

  const update = useCallback((fn: (d: Data) => Data) => setData((d) => fn(d)), []);

  const store: Store = {
    data,
    ready,
    update,
    setSettings: (patch) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } })),

    addRouteWithChildren: (input, children) => {
      if (!input.name.trim()) return 'Give the route a name.';
      if (children.length === 0) return 'Add at least one student to the route.';
      const cleaned: Omit<Student, 'id' | 'routeId' | 'order'>[] = [];
      for (const c of children) {
        const r = cleanStudent(c);
        if ('error' in r) return r.error;
        const seen = cleaned.find((x) => allNumbers(x).some((n) => allNumbers(r.fields).includes(n)));
        if (seen) return dupMessage(seen.child);
        cleaned.push(r.fields);
      }
      const route: Route = { id: uid(), name: input.name.trim(), days: input.days.length ? input.days : [1, 2, 3, 4, 5, 6] };
      update((d) => ({ ...d, routes: [...d.routes, route], students: [...d.students, ...cleaned.map((f, i) => ({ id: uid(), routeId: route.id, order: i, ...f }))] }));
      return null;
    },
    patchRoute: (id, patch) => {
      update((d) => ({ ...d, routes: d.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
      return null;
    },
    removeRoute: (id) =>
      update((d) => ({
        ...d,
        routes: d.routes.filter((r) => r.id !== id),
        students: d.students.filter((s) => s.routeId !== id),
      })),

    addStudent: (routeId, s) => {
      const c = cleanStudent(s);
      if ('error' in c) return c.error;
      const dup = duplicateIn(latest.current.students, routeId, [c.fields.phone, ...(c.fields.extraPhones ?? [])]);
      if (dup) return dupMessage(dup.child);
      update((d) => {
        const last = Math.max(-1, ...d.students.filter((x) => x.routeId === routeId).map((x) => x.order));
        return { ...d, students: [...d.students, { id: uid(), routeId, order: last + 1, ...c.fields }] };
      });
      return null;
    },
    updateStudent: (id, s) => {
      const c = cleanStudent(s);
      if ('error' in c) return c.error;
      const me = latest.current.students.find((x) => x.id === id);
      const dup = me && duplicateIn(latest.current.students, me.routeId, [c.fields.phone, ...(c.fields.extraPhones ?? [])], id);
      if (dup) return dupMessage(dup.child);
      update((d) => ({ ...d, students: d.students.map((x) => (x.id === id ? { ...x, ...c.fields } : x)) }));
      return null;
    },
    removeStudent: (id) => update((d) => ({ ...d, students: d.students.filter((s) => s.id !== id) })),
    reorderStudents: (routeId, ids) =>
      update((d) => ({ ...d, students: d.students.map((s) => (s.routeId === routeId && ids.includes(s.id) ? { ...s, order: ids.indexOf(s.id) } : s)) })),

    setAbsent: (studentId, date, absent) =>
      update((d) => {
        const cur = d.absences[date] ?? [];
        const next = absent ? (cur.includes(studentId) ? cur : [...cur, studentId]) : cur.filter((x) => x !== studentId);
        return { ...d, absences: { ...d.absences, [date]: next } };
      }),
    startRun: (date, routeId, startedAt) =>
      update((d) => ({
        ...d,
        started: { ...d.started, [runKey(date, routeId)]: startedAt },
        cancelled: { ...d.cancelled, [runKey(date, routeId)]: false },
      })),
    setCancelled: (date, routeId, cancelled) =>
      update((d) => ({ ...d, cancelled: { ...d.cancelled, [runKey(date, routeId)]: cancelled } })),

    markPaid: (id, month, mode) =>
      update((d) => ({ ...d, payments: { ...d.payments, [`${id}:${month}`]: { mode, paidOn: Date.now() } } })),
    undoPaid: (id, month) =>
      update((d) => {
        const payments = { ...d.payments };
        delete payments[`${id}:${month}`];
        return { ...d, payments };
      }),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

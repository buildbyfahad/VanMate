import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { VanCaller } from '../../modules/van-caller/src/VanCallerModule';
import { useCaller } from '../caller';
import { prettyDate, timeLabel, todayISO } from '../dates';
import { useNow } from '../hooks';
import { minLabel, prettyPhone } from '../pickers';
import { PlannedCall, PlannedRun, STALE_MIN, allNumbers, runsForDate, startedAtFor } from '../plan';
import { useStore } from '../store';
import { LogEntry } from '../../modules/van-caller/src/VanCallerModule';
import { Btn, Card, Chip, H2, Icon, Muted, ProgressBar, C, row } from '../ui';

type Kind = 'called' | 'next' | 'waiting' | 'bad' | 'skip';
type Log = Record<string, LogEntry>;

const countdown = (ms: number) => {
  const min = Math.ceil(ms / 60_000);
  if (min <= 0) return 'any moment now';
  if (min < 60) return `in ${min} min`;
  return `in ${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ''}`;
};

function TimelineDot({ kind }: { kind: Kind }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (kind !== 'next') return;
    const loop = Animated.loop(
      Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true })]),
    );
    loop.start();
    return () => loop.stop();
  }, [kind, pulse]);

  const fill = kind === 'called' ? C.ok : kind === 'next' ? C.brand : kind === 'bad' ? C.bad : kind === 'skip' ? C.amber : '#fff';
  const icon = kind === 'called' ? 'check' : kind === 'next' ? 'phone' : kind === 'bad' ? 'x' : kind === 'skip' ? 'minus' : '';
  return (
    <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
      {kind === 'next' && (
        <Animated.View
          style={{ position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: C.brand, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }}
        />
      )}
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: fill, borderWidth: kind === 'waiting' ? 2 : 0, borderColor: '#C5D2CE', alignItems: 'center', justifyContent: 'center' }}>
        {!!icon && <Icon name={icon} size={14} color="#fff" stroke={3} />}
      </View>
    </View>
  );
}

const talkLabel = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m === 0 ? `${s} sec` : s === 0 ? `${m} min` : `${m} min ${s} sec`;
};

/** The real result of a call, in the driver's words. */
function outcomeStatus(l: LogEntry | undefined): { kind: Kind; label: string; tone: string } {
  const at = l ? timeLabel(l.at) : '';
  switch (l?.outcome) {
    case 'talked':
      return { kind: 'called', label: `Talked ${talkLabel(l.talkSec ?? 0)}`, tone: C.ok };
    case 'unanswered':
      return { kind: 'called', label: 'Rang, not picked up', tone: C.warn };
    case 'cut':
      return { kind: 'called', label: 'Call was cut', tone: C.warn };
    default:
      return { kind: 'called', label: `Called ${at}`, tone: C.ok };
  }
}

/** Everything the screens need to know about one route's calls right now. */
function stats(run: PlannedRun, log: Log, now: number) {
  const calledCount = (c: PlannedCall) => c.keys.filter((k) => log[k]?.ok).length;
  const allCalled = (c: PlannedCall) => calledCount(c) === c.keys.length;
  const failed = (c: PlannedCall) => c.keys.some((k) => log[k] && !log[k].ok);
  const late = (c: PlannedCall) => c.at !== null && now - c.at > STALE_MIN * 60_000;
  const countable = run.calls.filter((c) => !c.absent);
  const done = countable.filter(allCalled);
  const waiting = countable.filter((c) => !allCalled(c) && !late(c) && !failed(c));
  const missed = countable.filter((c) => !allCalled(c) && (late(c) || failed(c)));
  const live = !run.cancelled && run.startedAt !== null;
  const next = live ? waiting.filter((c) => c.at !== null).sort((a, b) => a.at! - b.at!)[0] : undefined;
  return { calledCount, allCalled, failed, late, countable, done, waiting, missed, next, skipped: run.calls.filter((c) => c.absent).length };
}

export default function Today({ goRoutes, openPhoneSetup }: { goRoutes: () => void; openPhoneSetup: () => void }) {
  const { data, startRun } = useStore();
  const { supported, permissionsOk, log, sims, callLogOk, requestCallLog, requestPermissions } = useCaller();
  const date = todayISO();
  const now = useNow(15_000);
  const runs = runsForDate(data, date);
  const [openId, setOpenId] = useState<string | null>(null);

  // The phone's back button leaves the live screen instead of closing the app.
  useEffect(() => {
    if (!openId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpenId(null);
      return true;
    });
    return () => sub.remove();
  }, [openId]);

  const startNow = (run: PlannedRun) => {
    const doneKeys = new Set(Object.values(log).filter((l) => l.ok).map((l) => l.key));
    startRun(date, run.route.id, startedAtFor(run, doneKeys, Date.now()));
    setOpenId(run.route.id);
  };

  const allow = async () => {
    const ok = await requestPermissions();
    if (!ok) {
      Alert.alert('Calling is not allowed', 'Open the app settings and allow the Phone permission.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open settings', onPress: () => VanCaller.openAppSettings() },
      ]);
    }
  };

  const calling = !supported || permissionsOk;
  const hasRoutes = data.routes.length > 0;
  const hasKids = data.students.length > 0;
  const setupDone = calling && hasRoutes && hasKids;

  const openRun = openId ? runs.find((r) => r.route.id === openId) : undefined;
  if (setupDone && openRun) return <RunView run={openRun} log={log} now={now} onBack={() => setOpenId(null)} onStart={() => startNow(openRun)} />;

  const Step = ({ done: d, n, title, hint, action, onPress }: { done: boolean; n: number; title: string; hint: string; action: string; onPress: () => void }) => (
    <View style={[row, { alignItems: 'flex-start', paddingVertical: 12, gap: 14 }]}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: d ? C.ok : C.idleBg, alignItems: 'center', justifyContent: 'center' }}>
        {d ? <Icon name="check" size={16} color="#fff" stroke={3} /> : <Text style={{ fontWeight: '800', color: C.muted }}>{n}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '800', fontSize: 17, color: d ? C.muted : C.ink }}>{title}</Text>
        {!d && <Muted>{hint}</Muted>}
        {!d && (
          <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            <Btn small label={action} onPress={onPress} />
          </View>
        )}
      </View>
    </View>
  );

  /* ---- earlier days, from what the phone really dialled ---- */
  const byDay: Record<string, { ok: number; bad: number }> = {};
  for (const l of Object.values(log)) {
    const d = l.key.slice(0, 10);
    if (d === date || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    byDay[d] ??= { ok: 0, bad: 0 };
    if (l.ok) byDay[d].ok++;
    else byDay[d].bad++;
  }
  const earlier = Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 5);

  return (
    <View>
      {!supported && (
        <Card style={{ backgroundColor: C.warnBg }}>
          <Text style={{ fontWeight: '800', color: C.warn }}>Automatic calls work on Android phones only</Text>
          <Muted>This phone can't call parents by itself. You can still plan routes here.</Muted>
        </Card>
      )}

      {!setupDone && (
        <Card>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>Let's get you set up</Text>
          <Muted>Two quick steps and the phone will call the parents for you.</Muted>
          <View style={{ marginTop: 8 }}>
            {supported && <Step done={permissionsOk} n={1} title="Allow calling" hint="So the phone is allowed to place the calls." action="Allow calling" onPress={allow} />}
            <Step done={hasRoutes && hasKids} n={2} title="Add your route" hint="Name it and pick the parents from your contacts." action="Add a route" onPress={goRoutes} />
          </View>
        </Card>
      )}

      {setupDone && sims.length > 1 && !sims.some((x) => x.selected) && (
        <Card style={{ backgroundColor: C.warnBg }}>
          <Text style={{ fontWeight: '800', color: C.warn }}>Your phone has two SIM cards</Text>
          <Muted>Choose which one makes the calls, so the phone never stops to ask.</Muted>
          <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            <Btn small label="Choose SIM" onPress={openPhoneSetup} />
          </View>
        </Card>
      )}

      {setupDone && supported && !callLogOk && (
        <Card style={{ backgroundColor: C.warnBg }}>
          <Text style={{ fontWeight: '800', color: C.warn }}>See who picked up</Text>
          <Muted>Allow call history so each student shows if the parent answered, did not pick up, or cut the call, and how long you talked.</Muted>
          <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            <Btn small label="Allow" onPress={requestCallLog} />
          </View>
        </Card>
      )}

      {setupDone && runs.length === 0 && (
        <Card>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>No van today</Text>
          <Muted>None of your routes run today. Check the days of each route in Routes.</Muted>
        </Card>
      )}

      {setupDone &&
        runs.map((run) => {
          const st = stats(run, log, now);
          const started = run.startedAt !== null && !run.cancelled;
          const finished = started && !st.next && st.waiting.length === 0;
          let sub = `${run.calls.length} ${run.calls.length === 1 ? 'student' : 'students'}`;
          let tone: 'ok' | 'warn' | 'bad' | undefined;
          let chip = '';
          if (run.cancelled) {
            chip = 'Stopped';
            tone = 'bad';
          } else if (finished) {
            chip = st.missed.length ? 'Finished' : 'All called';
            tone = st.missed.length ? 'warn' : 'ok';
            sub = `${st.done.length} of ${st.countable.length} parents called`;
          } else if (started) {
            chip = 'Running';
            tone = 'ok';
            sub = `${st.done.length} of ${st.countable.length} parents called`;
          }
          return (
            <Pressable key={run.route.id} onPress={() => (started || run.cancelled ? setOpenId(run.route.id) : undefined)} disabled={!started && !run.cancelled}>
              <Card>
                <View style={[row, { justifyContent: 'space-between' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }} numberOfLines={1}>
                      {run.route.name}
                    </Text>
                    <Muted>{sub}</Muted>
                    {!!chip && (
                      <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                        <Chip label={chip} tone={tone} />
                      </View>
                    )}
                  </View>
                  {!started && !run.cancelled ? (
                    <Btn icon="zap" label="Start" onPress={() => startNow(run)} />
                  ) : run.cancelled ? (
                    <Btn tone="secondary" label="Start again" onPress={() => startNow(run)} />
                  ) : (
                    <View style={[row, { gap: 2 }]}>
                      <Text style={{ fontWeight: '800', color: C.brand }}>Open</Text>
                      <Icon name="chevronDown" size={18} color={C.brand} />
                    </View>
                  )}
                </View>
              </Card>
            </Pressable>
          );
        })}

      {setupDone && earlier.length > 0 && (
        <>
          <H2>Earlier days</H2>
          <Card>
            {earlier.map(([d, v], i) => (
              <View key={d} style={[row, { justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }]}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{prettyDate(d)}</Text>
                <View style={row}>
                  <Chip tone="ok" label={`${v.ok} called`} />
                  {v.bad > 0 && <Chip tone="bad" label={`${v.bad} failed`} />}
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </View>
  );
}

/* ---------- the live screen for one route ---------- */

function RunView({ run, log, now, onBack, onStart }: { run: PlannedRun; log: Log; now: number; onBack: () => void; onStart: () => void }) {
  const { setAbsent, setCancelled } = useStore();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const st = stats(run, log, now);
  const date = run.date;

  /** What happened (or will happen) for one student, in words and colour. */
  const status = (c: PlannedCall): { kind: Kind; label: string; tone: string } => {
    const n = st.calledCount(c);
    if (n === c.keys.length) return outcomeStatus(log[c.keys[0]]);
    if (n > 0) return { kind: 'called', label: `Called ${n} of ${c.keys.length} numbers`, tone: C.warn };
    if (c.absent) return { kind: 'skip', label: 'Absent today', tone: C.warn };
    if (run.cancelled) return { kind: 'skip', label: 'Route stopped', tone: C.muted };
    const failedLog = c.keys.map((k) => log[k]).find((l) => l && !l.ok);
    if (failedLog) return { kind: 'bad', label: failedLog.note || 'Could not call', tone: C.bad };
    if (st.late(c)) return { kind: 'bad', label: 'Missed', tone: C.bad };
    if (c.at === null) return { kind: 'waiting', label: c.offsetMin === 0 ? 'Called when you start' : `Called ${minLabel(c.offsetMin)} after start`, tone: C.muted };
    if (st.next && st.next.key === c.key) return { kind: 'next', label: c.at <= now ? 'Calling now' : `Call ${timeLabel(c.at)}`, tone: C.brand };
    return { kind: 'waiting', label: `Call ${timeLabel(c.at)}`, tone: C.muted };
  };

  let label = 'READY';
  let big = 'Ready to go';
  let sub = 'Tap Start when you leave.';
  if (run.cancelled) {
    label = 'ROUTE STOPPED';
    big = 'No more calls';
    sub = 'You stopped this route.';
  } else if (st.next) {
    label = st.next.at! <= now ? 'CALLING NOW' : 'NEXT CALL';
    big = st.next.student.child;
    sub = `${st.next.student.parent !== 'Parent' && st.next.student.parent !== st.next.student.child ? st.next.student.parent + ' · ' : ''}${timeLabel(st.next.at!)} · ${countdown(st.next.at! - now)}`;
  } else if (run.startedAt !== null) {
    label = st.missed.length ? 'FINISHED' : 'ALL DONE';
    big = st.missed.length ? `${st.done.length} of ${st.countable.length} called` : 'All parents called';
    sub = st.missed.length ? `${st.missed.length} could not be reached. See below.` : 'Nice. The parents know the van is on its way.';
  }

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={10} style={[row, { marginBottom: 10, alignSelf: 'flex-start' }]}>
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <Icon name="chevronDown" size={22} color={C.brand} stroke={2.6} />
        </View>
        <Text style={{ fontWeight: '800', color: C.brand, fontSize: 16 }}>All routes</Text>
      </Pressable>
      <Text style={{ fontSize: 24, fontWeight: '800', color: C.ink, marginBottom: 12 }}>{run.route.name}</Text>

      <LinearGradient colors={[C.brand, C.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 26, padding: 20, marginBottom: 12 }}>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '800', letterSpacing: 1.2, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 6 }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {big}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 4 }}>{sub}</Text>

        {run.startedAt === null && !run.cancelled && (
          <Pressable onPress={onStart} style={({ pressed }) => ({ marginTop: 18, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
            <View style={row}>
              <Icon name="zap" size={20} color={C.brand} />
              <Text style={{ fontWeight: '800', color: C.brand, fontSize: 18 }}>Start route</Text>
            </View>
          </Pressable>
        )}

        {st.countable.length > 0 && run.startedAt !== null && (
          <View style={{ marginTop: 18 }}>
            <ProgressBar value={st.done.length / st.countable.length} />
            <Text style={{ color: 'rgba(255,255,255,0.8)', marginTop: 8, fontWeight: '600' }}>
              {st.done.length} of {st.countable.length} parents called
            </Text>
          </View>
        )}
      </LinearGradient>

      {run.startedAt !== null && (
        <View style={[row, { gap: 10, marginBottom: 4 }]}>
          {[
            { n: st.done.length, t: 'Called', c: C.ok, bg: C.okBg },
            { n: st.waiting.length, t: 'Waiting', c: C.brand, bg: C.brandSoft },
            { n: st.missed.length + st.skipped, t: st.missed.length ? 'Missed / skipped' : 'Skipped', c: st.missed.length ? C.bad : C.warn, bg: st.missed.length ? C.badBg : C.warnBg },
          ].map((x) => (
            <View key={x.t} style={{ flex: 1, backgroundColor: x.bg, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: x.c }}>{x.n}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: x.c }}>{x.t}</Text>
            </View>
          ))}
        </View>
      )}

      <H2>Students</H2>
      <Card>
        {run.calls.map((c, i) => {
          const s = status(c);
          const open = openRow === c.key;
          const last = i === run.calls.length - 1;
          return (
            <View key={c.key} style={{ flexDirection: 'row' }}>
              <View style={{ width: 40, alignItems: 'center' }}>
                <TimelineDot kind={s.kind} />
                {!last && <View style={{ flex: 1, width: 2, backgroundColor: C.line, marginVertical: 2 }} />}
              </View>
              <Pressable onPress={() => setOpenRow(open ? null : c.key)} style={{ flex: 1, paddingBottom: last ? 0 : 16, paddingTop: 2 }}>
                <View style={[row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{c.student.child}</Text>
                    <Muted>
                      {c.student.parent !== c.student.child && c.student.parent !== 'Parent' ? `${c.student.parent} · ` : ''}
                      {prettyPhone(c.student.phone)}
                    </Muted>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: s.tone, marginLeft: 8, textAlign: 'right', maxWidth: 140 }}>{s.label}</Text>
                </View>
                {open && !run.cancelled && (
                  <View style={[row, { marginTop: 10, flexWrap: 'wrap' }]}>
                    {!c.absent && st.calledCount(c) < c.keys.length && (
                      <Btn
                        small
                        icon="phone"
                        label="Call again now"
                        onPress={() => {
                          const nums = allNumbers(c.student);
                          const todo = c.keys.map((k, n) => ({ k, num: nums[n] })).filter((x) => !log[x.k]?.ok);
                          const ok = todo.length > 0 && VanCaller.callNow(todo[0].k, `+${todo[0].num}`);
                          if (!ok) Alert.alert('Could not call', 'Finish your current call first, and make sure calling is allowed.');
                          setOpenRow(null);
                        }}
                      />
                    )}
                    {st.calledCount(c) === 0 && (
                      <Btn small tone="secondary" label={c.absent ? 'Coming after all' : 'Absent today'} onPress={() => { setAbsent(c.student.id, date, !c.absent); setOpenRow(null); }} />
                    )}
                  </View>
                )}
              </Pressable>
            </View>
          );
        })}
      </Card>

      {run.cancelled ? (
        <Btn label="Start again" onPress={onStart} />
      ) : (
        run.startedAt !== null && (
          <Btn
            tone="danger"
            label="Stop this route"
            onPress={() =>
              Alert.alert('Stop this route?', 'No more parents on this route will be called.', [
                { text: 'Keep going', style: 'cancel' },
                { text: 'Stop route', style: 'destructive', onPress: () => setCancelled(date, run.route.id, true) },
              ])
            }
          />
        )
      )}
    </View>
  );
}

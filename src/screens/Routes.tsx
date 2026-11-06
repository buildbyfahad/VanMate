import React, { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, Text, View } from 'react-native';
import { AddChildrenSheet } from '../addChildren';
import { DragList } from '../dragList';
import { MinutesStepper, PhoneNumbers, minLabel, prettyPhone } from '../pickers';
import { allNumbers, offsets, sortedKids } from '../plan';
import { useStore } from '../store';
import { Route, Student } from '../types';
import { Btn, Card, Field, FieldLabel, H2, Icon, Muted, Sheet, C, row } from '../ui';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const daysLabel = (days: number[]) => {
  const d = [...days].sort();
  if (d.length === 6 && d.join() === '1,2,3,4,5,6') return 'Mon to Sat';
  if (d.length === 5 && d.join() === '1,2,3,4,5') return 'Mon to Fri';
  return d.map((i) => DAY_NAMES[i]).join(', ') || 'No days';
};

export default function Routes() {
  const { data } = useStore();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [routeSheet, setRouteSheet] = useState(false);
  const [addFor, setAddFor] = useState<Route | null>(null);
  const [draft, setDraft] = useState<Route | null>(null); // a new route waiting for its first students
  const [editChild, setEditChild] = useState<null | { route: Route; student: Student }>(null);

  const detail = detailId ? data.routes.find((r) => r.id === detailId) : undefined;

  // The phone's back button goes back to the list of routes.
  useEffect(() => {
    if (!detail) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setDetailId(null);
      return true;
    });
    return () => sub.remove();
  }, [detail]);

  return (
    <View>
      {detail ? (
        <RouteDetail route={detail} onBack={() => setDetailId(null)} onAddStudents={() => setAddFor(detail)} onEditStudent={(student) => setEditChild({ route: detail, student })} />
      ) : (
        <>
          {data.routes.length === 0 && (
            <Card>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>No routes yet</Text>
              <Muted>A route is one run of the van. Add as many as you need, for the morning, the afternoon, or any other trip.</Muted>
            </Card>
          )}
          {data.routes.map((r) => (
            <RouteCard key={r.id} route={r} onOpen={() => setDetailId(r.id)} />
          ))}
          <Btn tone={data.routes.length ? 'secondary' : 'primary'} icon="plus" label="Add a route" onPress={() => setRouteSheet(true)} />
        </>
      )}

      {routeSheet && (
        <RouteSheet
          onClose={() => setRouteSheet(false)}
          onNext={(r) => {
            setRouteSheet(false);
            setDraft(r);
          }}
        />
      )}
      {draft && <AddChildrenSheet key="draft" route={draft} isNew onClose={() => setDraft(null)} />}
      {addFor && <AddChildrenSheet key={addFor.id} route={addFor} onClose={() => setAddFor(null)} />}
      {editChild && <ChildSheet key={editChild.student.id} route={editChild.route} student={editChild.student} onClose={() => setEditChild(null)} />}
    </View>
  );
}

/* ---------- route card (compact) ---------- */

function RouteCard({ route, onOpen }: { route: Route; onOpen: () => void }) {
  const { data } = useStore();
  const count = data.students.filter((s) => s.routeId === route.id).length;
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card>
        <View style={[row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', fontSize: 19, color: C.ink }} numberOfLines={1}>
              {route.name}
            </Text>
            <Muted>
              {count} {count === 1 ? 'student' : 'students'} · {daysLabel(route.days)}
            </Muted>
          </View>
          <View style={[row, { gap: 4 }]}>
            <Text style={{ fontWeight: '800', color: C.brand }}>Edit</Text>
            <View style={{ transform: [{ rotate: '-90deg' }] }}>
              <Icon name="chevronDown" size={18} color={C.brand} stroke={2.6} />
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/* ---------- one route: its name, days and students ---------- */

function RouteDetail({ route, onBack, onAddStudents, onEditStudent }: { route: Route; onBack: () => void; onAddStudents: () => void; onEditStudent: (s: Student) => void }) {
  const { data, patchRoute, removeRoute, reorderStudents } = useStore();
  const [name, setName] = useState(route.name);
  const kids = sortedKids(data, route.id);
  const offs = offsets(kids);

  const toggleDay = (i: number) => {
    const on = route.days.includes(i);
    if (on && route.days.length === 1) return; // a route must run on at least one day
    patchRoute(route.id, { days: on ? route.days.filter((x) => x !== i) : [...route.days, i] });
  };

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={10} style={[row, { marginBottom: 10, alignSelf: 'flex-start' }]}>
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <Icon name="chevronDown" size={22} color={C.brand} stroke={2.6} />
        </View>
        <Text style={{ fontWeight: '800', color: C.brand, fontSize: 16 }}>All routes</Text>
      </Pressable>

      <Field
        label="Route name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (t.trim()) patchRoute(route.id, { name: t.trim() });
        }}
      />

      <FieldLabel>Runs on</FieldLabel>
      <View style={[row, { gap: 6 }]}>
        {DAY_LETTERS.map((d, i) => {
          const on = route.days.includes(i);
          return (
            <Pressable key={i} onPress={() => toggleDay(i)} style={{ flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.brand : C.idleBg }}>
              <Text style={{ fontWeight: '800', color: on ? '#fff' : C.muted }}>{d}</Text>
            </Pressable>
          );
        })}
      </View>

      <H2>
        {kids.length} {kids.length === 1 ? 'student' : 'students'}
      </H2>
      {kids.length > 1 && <Muted style={{ marginBottom: 8 }}>Drag the dots to change the order. The top student is called as soon as you start.</Muted>}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <DragList
          items={kids}
          keyOf={(k) => k.id}
          height={68}
          onReorder={(ids) => reorderStudents(route.id, ids)}
          renderItem={(st, i, grip) => (
            <View style={[row, { height: 68, borderBottomWidth: 1, borderBottomColor: C.line, paddingLeft: kids.length > 1 ? 0 : 16 }]}>
              {kids.length > 1 && grip}
              <Pressable onPress={() => onEditStudent(st)} style={({ pressed }) => ({ flex: 1, height: 68, justifyContent: 'center', paddingRight: 16, opacity: pressed ? 0.6 : 1 })}>
                <View style={[row, { justifyContent: 'space-between' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }} numberOfLines={1}>
                      {i + 1}. {st.child}
                    </Text>
                    <Muted>{allNumbers(st).map(prettyPhone).join(' · ')}</Muted>
                  </View>
                  <Text style={{ fontWeight: '800', color: C.brand, marginLeft: 8 }}>{i === 0 ? 'At start' : `+${minLabel(offs[i])}`}</Text>
                </View>
              </Pressable>
            </View>
          )}
        />
      </Card>

      <Btn icon="plus" label="Add students" onPress={onAddStudents} />
      <Muted style={{ textAlign: 'center', marginTop: 8 }}>Tap a student to change their name, number, timing or fee.</Muted>

      <View style={{ marginTop: 24 }}>
        <Btn
          tone="danger"
          icon="trash"
          label="Delete this route"
          onPress={() =>
            Alert.alert(`Delete ${route.name}?`, 'Its students are removed too.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  removeRoute(route.id);
                  onBack();
                },
              },
            ])
          }
        />
      </View>
    </View>
  );
}

/* ---------- add / edit a route ---------- */

function RouteSheet({ onClose, onNext }: { onClose: () => void; onNext: (draft: Route) => void }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [error, setError] = useState('');

  const save = () => {
    if (!name.trim()) return setError('Give the route a name, for example the area it covers.');
    if (days.length === 0) return setError('Choose at least one day.');
    onNext({ id: 'new', name: name.trim(), days });
  };

  return (
    <Sheet
      visible
      title="New route"
      onClose={onClose}
      footer={
        <View>
          {!!error && <Text style={{ color: C.bad, marginBottom: 8 }}>{error}</Text>}
          <Btn label="Next: add students" onPress={save} />
        </View>
      }
    >
      <Field label="Route name" value={name} onChangeText={setName} placeholder="e.g. Sector 5 side" autoFocus />
      <FieldLabel>Runs on</FieldLabel>
      <View style={[row, { gap: 6 }]}>
        {DAY_LETTERS.map((d, i) => {
          const on = days.includes(i);
          return (
            <Pressable
              key={i}
              onPress={() => setDays(on ? days.filter((x) => x !== i) : [...days, i])}
              style={{ flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.brand : C.idleBg }}
            >
              <Text style={{ fontWeight: '800', color: on ? '#fff' : C.muted }}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
      <Muted style={{ marginTop: 8 }}>{daysLabel(days)}</Muted>
    </Sheet>
  );
}

/* ---------- edit one child ---------- */

function ChildSheet({ route, student, onClose }: { route: Route; student: Student; onClose: () => void }) {
  const { data, updateStudent, removeStudent } = useStore();
  const isFirst = sortedKids(data, route.id)[0]?.id === student.id;
  const [child, setChild] = useState(student.child);
  const [parent, setParent] = useState(student.parent !== 'Parent' ? student.parent : '');
  const [phones, setPhones] = useState<string[]>(allNumbers(student));
  const [gap, setGap] = useState(student.gapMin);
  const [fee, setFee] = useState(student.fee ? String(student.fee) : '');
  const [error, setError] = useState('');

  const save = () => {
    const err = updateStudent(student.id, { child, parent, phones, fee: Number(fee) || 0, gapMin: gap });
    if (err) return setError(err);
    onClose();
  };

  return (
    <Sheet
      visible
      title={student.child}
      onClose={onClose}
      footer={
        <View>
          {!!error && <Text style={{ color: C.bad, marginBottom: 8 }}>{error}</Text>}
          <Btn label="Save changes" onPress={save} />
        </View>
      }
    >
      <Muted>{route.name}</Muted>

      <Field label="Student's name" value={child} onChangeText={setChild} />

      <FieldLabel>When to call</FieldLabel>
      {isFirst ? (
        <Card style={{ marginBottom: 0, backgroundColor: C.brandSoft, shadowOpacity: 0 }}>
          <Text style={{ color: C.ink, fontWeight: '800', fontSize: 16 }}>Called as soon as you start the route</Text>
          <Muted>The first student on the list is always called straight away. Drag another student to the top to change this.</Muted>
        </Card>
      ) : (
        <Card style={{ marginBottom: 0 }}>
          <Muted style={{ marginBottom: 8 }}>Minutes after the student above</Muted>
          <MinutesStepper value={gap} onChange={setGap} />
        </Card>
      )}

      <PhoneNumbers phones={phones} onChange={setPhones} onContactName={(n) => !parent.trim() && setParent(n)} />

      <Field label="Monthly fee in ₹ (optional)" value={fee} onChangeText={(t) => setFee(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="e.g. 800" />
      <Field label="Parent's name (optional)" value={parent} onChangeText={setParent} />

      <View style={{ marginTop: 24 }}>
        <Btn
          tone="danger"
          icon="trash"
          label={`Remove ${student.child}`}
          onPress={() => {
            const left = data.students.filter((x) => x.routeId === route.id).length;
            if (left <= 1) return Alert.alert('A route needs at least one student', 'To remove the last student, delete the whole route instead.');
            Alert.alert(`Remove ${student.child}?`, undefined, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => {
                  removeStudent(student.id);
                  onClose();
                },
              },
            ]);
          }}
        />
      </View>
    </Sheet>
  );
}

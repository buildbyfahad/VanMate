import React, { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { ensureContactsPermission, loadContacts, PhoneContact } from './contacts';
import { normalizePhone } from './phone';
import { MinutesStepper, minLabel, prettyPhone } from './pickers';
import { allNumbers, offsets, sortedKids } from './plan';
import { useStore } from './store';
import { Route } from './types';
import { Btn, Card, C, Icon, Muted, Sheet, row } from './ui';

interface Draft {
  key: string;
  child: string;
  parent: string;
  phone: string; // normalized for contacts, as typed for typed rows
  typed: boolean;
  gap: number; // minutes after the student above
  fee: string; // monthly fee in rupees, as typed (optional)
}

const DEFAULT_GAP = 5;

/**
 * Add students to a route with as few taps as possible:
 * pick several parents from the contacts, type each student's name, set when to call, done.
 */
export function AddChildrenSheet({ route, isNew, onClose }: { route: Route; isNew?: boolean; onClose: () => void }) {
  const { data, addStudent, addRouteWithChildren } = useStore();
  const siblings = sortedKids(data, route.id);
  const baseOffset = siblings.length ? offsets(siblings)[siblings.length - 1] : 0; // minutes after start of the last student already on the route

  const [step, setStep] = useState<'start' | 'contacts' | 'review'>('start');
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const taken = new Set(siblings.flatMap((s) => allNumbers(s))); // numbers already on this route
  const [rows, setRows] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [bad, setBad] = useState<string[]>([]); // keys of rows that need fixing

  const openContacts = async () => {
    setLoading(true);
    setDenied(false);
    try {
      if (!(await ensureContactsPermission())) {
        setDenied(true);
        return;
      }
      setContacts(await loadContacts());
      setStep('contacts');
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  };

  const startTyped = () => {
    setRows([{ key: `t${Date.now()}`, child: '', parent: '', phone: '', typed: true, gap: DEFAULT_GAP, fee: '' }]);
    setStep('review');
  };

  const toReview = () => {
    const chosen = contacts.filter((c) => picked.includes(c.id));
    setRows(chosen.map((c) => ({ key: c.id, child: c.name, parent: c.name, phone: c.numbers[0], typed: false, gap: DEFAULT_GAP, fee: '' })));
    setStep('review');
  };

  const patch = (key: string, p: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const addTypedRow = () => {
    setRows((rs) => [...rs, { key: `t${Date.now()}`, child: '', parent: '', phone: '', typed: true, gap: DEFAULT_GAP, fee: '' }]);
  };

  const save = () => {
    const problems: string[] = [];
    for (const r of rows) {
      if (!r.child.trim() || normalizePhone(r.phone).length < 10) problems.push(r.key);
    }
    const seen = new Set(taken);
    for (const r of rows) {
      const n = normalizePhone(r.phone);
      if (n.length < 10) continue;
      if (seen.has(n)) {
        setBad([...problems, r.key]);
        return setError(`${r.child.trim() || 'That number'} is already in this route.`);
      }
      seen.add(n);
    }
    if (problems.length) {
      setBad(problems);
      return setError('Fill in each student\'s name and phone number.');
    }
    const inputs = rows.map((r) => ({
      child: r.child,
      parent: r.parent,
      phones: [r.phone],
      fee: Number(r.fee.replace(/\D/g, '')) || 0,
      gapMin: r.gap,
    }));
    if (isNew) {
      const err = addRouteWithChildren({ name: route.name, days: route.days }, inputs);
      if (err) return setError(err);
    } else {
      for (const input of inputs) {
        const err = addStudent(route.id, input);
        if (err) return setError(err);
      }
    }
    onClose();
  };

  /* ---------- step 1: choose how ---------- */
  let title = isNew ? `${route.name}: add students` : 'Add students';
  let footer: React.ReactNode = undefined;
  let scroll = true;
  let body: React.ReactNode = null;

  if (step === 'start') {
    body = (
      <>
        <Muted>{route.name}</Muted>
        <Pressable onPress={openContacts} disabled={loading} style={{ marginTop: 16 }}>
          <Card style={{ marginBottom: 0, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="users" size={26} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>{loading ? 'Loading contacts…' : 'Choose from contacts'}</Text>
              <Muted>Pick many parents at once. Fastest.</Muted>
            </View>
            <Icon name="chevronDown" size={20} color={C.muted} />
          </Card>
        </Pressable>

        <Pressable onPress={startTyped} style={{ marginTop: 12 }}>
          <Card style={{ marginBottom: 0, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: C.idleBg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="phone" size={24} color={C.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>Type a number</Text>
              <Muted>For someone who is not in your contacts.</Muted>
            </View>
          </Card>
        </Pressable>

        {denied && (
          <Card style={{ marginTop: 16, backgroundColor: C.warnBg }}>
            <Text style={{ fontWeight: '800', color: C.warn }}>VanMate can't read your contacts</Text>
            <Muted>Allow the Contacts permission to pick parents. Your contacts stay on this phone. Or type the number instead.</Muted>
            <View style={[row, { marginTop: 10 }]}>
              <Btn small label="Open settings" onPress={() => Linking.openSettings()} />
              <Btn small tone="ghost" label="Try again" onPress={openContacts} />
            </View>
          </Card>
        )}
      </>
    );
  }

  /* ---------- step 2: pick contacts ---------- */
  if (step === 'contacts') {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    const shown = q ? contacts.filter((c) => c.name.toLowerCase().includes(q) || (qDigits.length >= 3 && c.numbers.some((n) => n.includes(qDigits)))) : contacts;
    title = 'Choose parents';
    scroll = false;
    footer = <Btn label={picked.length ? `Continue with ${picked.length}` : 'Select at least one'} disabled={picked.length === 0} onPress={toReview} />;
    body = (
      <>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[row, { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: C.line }]}>
            <Icon name="search" size={20} color={C.muted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search by name or number" placeholderTextColor="#9AA8A4" style={{ flex: 1, paddingVertical: 12, fontSize: 16, color: C.ink }} />
          </View>
        </View>
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          getItemLayout={(_, i) => ({ length: 66, offset: 66 * i, index: i })}
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.muted, padding: 32 }}>{contacts.length ? 'No match.' : 'No contacts with a phone number.'}</Text>}
          renderItem={({ item }) => {
            const already = item.numbers.some((n) => taken.has(n));
            const on = !already && picked.includes(item.id);
            return (
              <Pressable
                disabled={already}
                onPress={() => setPicked((p) => (on ? p.filter((x) => x !== item.id) : [...p, item.id]))}
                style={({ pressed }) => ({ opacity: already ? 0.45 : 1, height: 66, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, backgroundColor: on ? C.brandSoft : pressed ? C.idleBg : 'transparent' })}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: on ? C.brand : '#C5D2CE', backgroundColor: on ? C.brand : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <Icon name="check" size={16} color="#fff" stroke={3} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Muted>
                    {already ? 'Already in this route' : prettyPhone(item.numbers[0])}
                    {!already && item.numbers.length > 1 ? `  ·  +${item.numbers.length - 1} more` : ''}
                  </Muted>
                </View>
              </Pressable>
            );
          }}
        />
      </>
    );
  }

  /* ---------- step 3: name them, check the times ---------- */
  if (step === 'review') {
    title = rows.length === 1 ? 'Add a student' : `Add ${rows.length} students`;
    footer = (
        <View>
          {!!error && <Text style={{ color: C.bad, marginBottom: 8 }}>{error}</Text>}
          <Btn label={isNew ? (rows.length === 1 ? 'Save route and student' : `Save route and ${rows.length} students`) : rows.length === 1 ? 'Save student' : `Save ${rows.length} students`} onPress={save} />
        </View>
    );
    body = (
      <>
      <Muted>
        {route.name}.{rows.some((r) => !r.typed) ? " We filled in each name from your contacts. Type the student's name instead." : ''}
      </Muted>

      {rows.map((r, i) => {
        const flagged = bad.includes(r.key);
        return (
          <Card key={r.key} style={{ marginTop: 12, marginBottom: 0, ...(flagged ? { borderWidth: 1.5, borderColor: C.bad } : {}) }}>
            <View style={[row, { alignItems: 'flex-start' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, letterSpacing: 0.6 }}>STUDENT'S NAME</Text>
                <TextInput
                  value={r.child}
                  onChangeText={(t) => patch(r.key, { child: t })}
                  placeholder="Student's name"
                  placeholderTextColor="#9AA8A4"
                  selectTextOnFocus
                  autoFocus={i === 0 && r.typed}
                  style={{ fontSize: 22, fontWeight: '800', color: C.ink, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}
                />
              </View>
              {rows.length > 1 && (
                <Pressable onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} hitSlop={10} style={{ padding: 6 }}>
                  <Icon name="x" size={20} color={C.muted} />
                </Pressable>
              )}
            </View>

            {r.typed ? (
              <TextInput
                value={r.phone}
                onChangeText={(t) => patch(r.key, { phone: t })}
                placeholder="Parent's mobile number"
                placeholderTextColor="#9AA8A4"
                keyboardType="phone-pad"
                style={{ fontSize: 17, color: C.ink, paddingVertical: 10, marginTop: 6, borderBottomWidth: 1, borderBottomColor: C.line }}
              />
            ) : (
              <Muted style={{ marginTop: 6 }}>
                Parent: {r.parent} · {prettyPhone(r.phone)}
              </Muted>
            )}

            {i === 0 && siblings.length === 0 ? (
              <View style={{ marginTop: 14, backgroundColor: C.brandSoft, borderRadius: 14, padding: 12 }}>
                <Text style={{ color: C.ink, fontWeight: '800' }}>Called as soon as you start the route</Text>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, letterSpacing: 0.6, marginTop: 14 }}>CALL AFTER THE STUDENT ABOVE</Text>
                <MinutesStepper value={r.gap} onChange={(v) => patch(r.key, { gap: v })} />
                <Muted style={{ textAlign: 'center' }}>About {minLabel(baseOffset + rows.slice(0, i + 1).reduce((t, x, n) => t + (n === 0 && siblings.length === 0 ? 0 : x.gap), 0))} after you start</Muted>
              </>
            )}

            <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, letterSpacing: 0.6, marginTop: 14 }}>MONTHLY FEE IN ₹ (OPTIONAL)</Text>
            <TextInput
              value={r.fee}
              onChangeText={(t) => patch(r.key, { fee: t.replace(/\D/g, '') })}
              placeholder="e.g. 800"
              placeholderTextColor="#9AA8A4"
              keyboardType="number-pad"
              style={{ fontSize: 20, fontWeight: '700', color: C.ink, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}
            />
          </Card>
        );
      })}

      {rows.some((r) => r.typed) && (
        <View style={{ marginTop: 12 }}>
          <Btn tone="secondary" icon="plus" label="Add another student" onPress={addTypedRow} />
        </View>
      )}
      </>
    );
  }

  return (
    <Sheet visible title={title} onClose={onClose} footer={footer} scroll={scroll}>
      {body}
    </Sheet>
  );
}

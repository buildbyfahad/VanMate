import React, { useState } from 'react';
import { Alert, Linking, Modal, Pressable, Text, View } from 'react-native';
import { Contact } from 'expo-contacts';
import { ensureContactsPermission } from './contacts';
import { normalizePhone } from './phone';
import { Btn, C, Card, Field, FieldLabel, Icon, Muted, row } from './ui';

/** "5 min", "1 hr 5 min". */
export const minLabel = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`);

/** A number of minutes you nudge with − and +. No typing, no clock. */
export function MinutesStepper({ value, onChange, step = 1, max = 120 }: { value: number; onChange: (m: number) => void; step?: number; max?: number }) {
  const set = (m: number) => onChange(Math.min(max, Math.max(0, m)));
  const round = {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.brandSoft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  return (
    <View style={[row, { justifyContent: 'space-between' }]}>
      <Pressable onPress={() => set(value - step)} style={({ pressed }) => [round, pressed && { opacity: 0.6 }]} hitSlop={6}>
        <Icon name="minus" size={22} color={C.brand} />
      </Pressable>
      <Text style={{ flex: 1, textAlign: 'center', fontSize: 24, fontWeight: '800', color: C.ink }}>{minLabel(value)}</Text>
      <Pressable onPress={() => set(value + step)} style={({ pressed }) => [round, pressed && { opacity: 0.6 }]} hitSlop={6}>
        <Icon name="plus" size={22} color={C.brand} />
      </Pressable>
    </View>
  );
}

export const prettyPhone = (n: string) => (n.startsWith('91') && n.length === 12 ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : `+${n}`);

const MAX_NUMBERS = 3;

/**
 * Parent phone numbers for a child: pick from the phone's contacts or type one, and add more than one.
 */
export function PhoneNumbers({
  phones,
  onChange,
  onContactName,
}: {
  phones: string[];
  onChange: (phones: string[]) => void;
  onContactName?: (name: string) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [choose, setChoose] = useState<{ name: string; numbers: string[] } | null>(null);

  const add = (raw: string) => {
    const n = normalizePhone(raw);
    if (n.length < 10) return setError('Enter a valid mobile number, 10 digits.');
    if (phones.includes(n)) return setError('That number is already added.');
    if (phones.length >= MAX_NUMBERS) return setError(`You can add up to ${MAX_NUMBERS} numbers.`);
    setError('');
    onChange([...phones, n]);
  };

  const fromContacts = async () => {
    setError('');
    try {
      if (!(await ensureContactsPermission())) {
        return Alert.alert('Allow contacts', 'VanMate needs permission to read your contacts so you can pick a parent. You can also type the number.', [
          { text: 'Type instead', style: 'cancel', onPress: () => setTyping(true) },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
      }
      const c = await Contact.presentPicker();
      if (!c) return; // cancelled
      const [name, list] = await Promise.all([c.getFullName(), c.getPhones()]);
      const numbers = [...new Set(list.map((p) => normalizePhone(p.number ?? '')).filter((n) => n.length >= 10))];
      if (numbers.length === 0) return Alert.alert('No phone number', 'That contact has no phone number saved.');
      if (name) onContactName?.(name);
      if (numbers.length === 1) add(numbers[0]);
      else setChoose({ name, numbers });
    } catch {
      Alert.alert('Could not open contacts', 'You can type the number instead.');
    }
  };

  return (
    <View>
      <FieldLabel>{phones.length === 0 ? "Parent's phone number" : 'Phone numbers to call'}</FieldLabel>

      {phones.map((n, i) => (
        <View key={n} style={[row, { justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, marginBottom: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{prettyPhone(n)}</Text>
            <Muted>{i === 0 ? 'Main number' : 'Extra number, called after the main one'}</Muted>
          </View>
          <Btn small tone="danger" label="Remove" onPress={() => onChange(phones.filter((x) => x !== n))} />
        </View>
      ))}

      {phones.length < MAX_NUMBERS && (
        <View style={{ gap: 8 }}>
          <Btn tone="secondary" icon="users" label={phones.length === 0 ? 'Choose from contacts' : 'Add another from contacts'} onPress={fromContacts} />
          {!typing ? (
            <Btn tone="ghost" label={phones.length === 0 ? 'Type a number instead' : 'Type another number'} onPress={() => setTyping(true)} />
          ) : (
            <Card style={{ marginBottom: 0 }}>
              <Field label="Mobile number" value={typed} onChangeText={setTyped} keyboardType="phone-pad" placeholder="98765 43210" autoFocus />
              <View style={[row, { marginTop: 12 }]}>
                <Btn
                  small
                  label="Add number"
                  onPress={() => {
                    add(typed);
                    if (normalizePhone(typed).length >= 10) {
                      setTyped('');
                      setTyping(false);
                    }
                  }}
                />
                <Btn small tone="ghost" label="Cancel" onPress={() => { setTyping(false); setTyped(''); setError(''); }} />
              </View>
            </Card>
          )}
        </View>
      )}
      {!!error && <Text style={{ color: C.bad, marginTop: 6 }}>{error}</Text>}

      <Modal visible={choose !== null} transparent animationType="fade" onRequestClose={() => setChoose(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>Which number for {choose?.name}?</Text>
            <View style={{ gap: 8, marginTop: 14 }}>
              {choose?.numbers.map((n) => (
                <Btn
                  key={n}
                  tone="secondary"
                  label={prettyPhone(n)}
                  onPress={() => {
                    add(n);
                    setChoose(null);
                  }}
                />
              ))}
              <Btn small tone="ghost" label="Cancel" onPress={() => setChoose(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

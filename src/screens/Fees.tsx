import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useStore } from '../store';
import { sortedKids } from '../plan';
import { addMonths, monthKey, monthLabel } from '../dates';
import { msg, sendWhatsApp } from '../messages';
import { Btn, Card, Chip, Empty, Muted, C, row } from '../ui';

/** Fees are tracked one route at a time: pick a route, then see who has paid this month. */
export default function Fees() {
  const { data, markPaid, undoPaid } = useStore();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [picked, setPicked] = useState<string | null>(null);
  const lang = data.settings.lang;
  const driver = data.settings.driver || 'Driver';

  const route = data.routes.find((r) => r.id === picked) ?? data.routes[0];
  const students = route ? sortedKids(data, route.id) : [];

  const paid = (id: string) => data.payments[`${id}:${month}`];
  const collected = students.filter((s) => paid(s.id)).reduce((t, s) => t + s.fee, 0);
  const pending = students.filter((s) => !paid(s.id)).reduce((t, s) => t + s.fee, 0);

  if (!route) return <Empty>Add a route first, then track its fees here.</Empty>;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}>
        {data.routes.map((r) => {
          const on = r.id === route.id;
          return (
            <Pressable key={r.id} onPress={() => setPicked(r.id)} style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 20, backgroundColor: on ? C.brand : '#fff', borderWidth: 1, borderColor: on ? C.brand : C.line }}>
              <Text style={{ fontWeight: '800', color: on ? '#fff' : C.ink }}>{r.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[row, { justifyContent: 'space-between', marginBottom: 10 }]}>
        <Btn small tone="secondary" label="◀" onPress={() => setMonth(addMonths(month, -1))} />
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>{monthLabel(month)}</Text>
        <Btn small tone="secondary" label="▶" onPress={() => setMonth(addMonths(month, 1))} />
      </View>

      <View style={[row, { marginBottom: 10 }]}>
        <Card style={{ flex: 1, marginBottom: 0, alignItems: 'center' }}>
          <Muted>Collected</Muted>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.ok }}>₹{collected}</Text>
        </Card>
        <Card style={{ flex: 1, marginBottom: 0, alignItems: 'center' }}>
          <Muted>Pending</Muted>
          <Text style={{ fontSize: 22, fontWeight: '800', color: pending ? C.bad : C.ink }}>₹{pending}</Text>
        </Card>
      </View>

      {students.map((s) => {
        const p = paid(s.id);
        return (
          <Card key={s.id}>
            <View style={[row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>{s.child}</Text>
                <Muted>{s.fee ? `₹${s.fee} a month` : 'No fee set. Add it in Routes.'}</Muted>
              </View>
              {p ? <Chip tone="ok" label={`Paid · ${p.mode === 'cash' ? 'Cash' : 'UPI'}`} /> : <Chip tone="bad" label="Unpaid" />}
            </View>
            <View style={[row, { marginTop: 10, flexWrap: 'wrap' }]}>
              {p ? (
                <Btn small tone="secondary" label="Undo" onPress={() => undoPaid(s.id, month)} />
              ) : (
                <>
                  <Btn small label="Paid: Cash" onPress={() => markPaid(s.id, month, 'cash')} />
                  <Btn small label="Paid: UPI" onPress={() => markPaid(s.id, month, 'upi')} />
                  {s.fee > 0 && (
                    <Btn small tone="secondary" label="Remind" onPress={() => sendWhatsApp(s.phone, msg.fee(lang, { parent: s.parent, child: s.child, driver }, monthLabel(month), s.fee, data.settings.upi))} />
                  )}
                </>
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store';
import { CallerProvider, useCaller } from './src/caller';
import { VanCaller } from './modules/van-caller/src/VanCallerModule';
import { Btn, C, Card, Field, FieldLabel, H2, Icon, Muted, Sheet, row } from './src/ui';
import { prettyDate, timeLabel, todayISO } from './src/dates';
import Today from './src/screens/Today';
import Routes from './src/screens/Routes';
import Fees from './src/screens/Fees';

type Tab = 'today' | 'routes' | 'fees';

const TABS: { key: Tab; icon: string; label: string; title: string }[] = [
  { key: 'today', icon: 'home', label: 'Today', title: 'Today' },
  { key: 'routes', icon: 'route', label: 'Routes', title: 'Routes' },
  { key: 'fees', icon: 'wallet', label: 'Fees', title: 'Fees' },
];

const sameDay = (ms: number) => new Date(ms).toDateString() === new Date().toDateString();
const dayName = (ms: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(ms).getDay()];

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

function Shell() {
  const insets = useSafeAreaInsets();
  const { data, setSettings, ready } = useStore();
  const { supported, permissionsOk, nextRingAt, sims, callLogOk, requestCallLog, chooseSim, requestPermissions } = useCaller();
  const [tab, setTab] = useState<Tab>('today');
  const [showSettings, setShowSettings] = useState(false);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.brand }} />;

  const current = TABS.find((t) => t.key === tab)!;
  const subtitle =
    tab === 'today'
      ? supported && nextRingAt > 0
        ? `${prettyDate(todayISO())} · next call ${sameDay(nextRingAt) ? '' : dayName(nextRingAt) + ' '}${timeLabel(nextRingAt)}`
        : prettyDate(todayISO())
      : '';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 8 }}>
        <View style={[row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.muted }}>{greeting(data.settings.driver)}</Text>
            <Text style={{ fontSize: 32, fontWeight: '800', color: C.ink, marginTop: 2 }}>{current.title}</Text>
            {!!subtitle && <Text style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>{subtitle}</Text>}
          </View>
          <Pressable onPress={() => setShowSettings(true)} hitSlop={10} style={s.iconBtn}>
            <Icon name="sliders" size={22} color={C.ink} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {tab === 'today' && <Today goRoutes={() => setTab('routes')} openPhoneSetup={() => setShowSettings(true)} />}
        {tab === 'routes' && <Routes />}
        {tab === 'fees' && <Fees />}
      </ScrollView>

      <View style={[s.tabs, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} style={s.tab} onPress={() => setTab(t.key)}>
              <View style={[s.tabIcon, on && { backgroundColor: C.brandSoft }]}>
                <Icon name={t.icon} size={22} color={on ? C.brand : C.muted} stroke={on ? 2.4 : 2} />
              </View>
              <Text style={[s.tabLabel, on && { color: C.brand, fontWeight: '800' }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {showSettings && (
        <Sheet visible title="Settings" onClose={() => setShowSettings(false)} footer={<Btn label="Done" onPress={() => setShowSettings(false)} />}>
          <Field label="Your name" value={data.settings.driver} onChangeText={(driver) => setSettings({ driver })} placeholder="Shown in greetings and messages" />
          <Field label="Your UPI ID (added to fee reminders)" value={data.settings.upi} autoCapitalize="none" placeholder="name@upi" onChangeText={(upi) => setSettings({ upi })} />

          <H2>Automatic calls</H2>
          {!supported ? (
            <Muted>Only Android phones can call parents by themselves.</Muted>
          ) : (
            <Card>
              <View style={[row, { justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>Calling</Text>
                  <Muted>{permissionsOk ? 'Allowed' : 'Not allowed yet'}</Muted>
                </View>
                {permissionsOk ? (
                  <Icon name="check" size={22} color={C.ok} stroke={3} />
                ) : (
                  <Btn
                    small
                    label="Allow"
                    onPress={async () => {
                      const ok = await requestPermissions();
                      if (!ok)
                        Alert.alert('Calling not allowed', 'Open the app settings and allow Phone permissions.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Open settings', onPress: () => VanCaller.openAppSettings() },
                        ]);
                    }}
                  />
                )}
              </View>
              <Muted style={{ marginTop: 10 }}>
                Calls are normal phone calls from your SIM. If a parent does not pick up, the phone company ends the call by itself. If they pick up, you can talk as usual.
              </Muted>
              <View style={[row, { justifyContent: 'space-between', marginTop: 14 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>Call results</Text>
                  <Muted>{callLogOk ? 'Allowed. You see who picked up and how long you talked.' : 'Allow call history to see who picked up.'}</Muted>
                </View>
                {callLogOk ? <Icon name="check" size={22} color={C.ok} stroke={3} /> : <Btn small label="Allow" onPress={requestCallLog} />}
              </View>
              {sims.length > 1 && (
                <View style={{ marginTop: 14 }}>
                  <FieldLabel>Which SIM makes the calls?</FieldLabel>
                  {sims.map((sim) => (
                    <Pressable
                      key={sim.id}
                      onPress={() => chooseSim(sim.id)}
                      style={[row, { justifyContent: 'space-between', padding: 14, borderRadius: 14, marginBottom: 8, backgroundColor: sim.selected ? C.brandSoft : C.idleBg }]}
                    >
                      <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink, flex: 1 }}>{sim.label}</Text>
                      {sim.selected && <Icon name="check" size={20} color={C.brand} stroke={3} />}
                    </Pressable>
                  ))}
                  {!sims.some((x) => x.selected) && <Muted>Choose one so the phone never stops to ask which SIM to use.</Muted>}
                </View>
              )}
              <View style={{ marginTop: 12 }}>
                <Btn tone="secondary" label="Keep the app awake (battery settings)" onPress={() => VanCaller.openBatterySettings()} />
              </View>
            </Card>
          )}

        </Sheet>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <CallerProvider>
          <Shell />
        </CallerProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#0A2420', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  tabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    shadowColor: '#0A2420',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { width: 58, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 12, fontWeight: '600', color: C.muted },
});

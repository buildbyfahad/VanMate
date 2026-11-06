import React, { ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

export const C = {
  bg: '#F4F7F6',
  card: '#ffffff',
  ink: '#0E1C19',
  muted: '#62736E',
  line: '#E6EDEB',
  brand: '#0F766E',
  brandDark: '#0A4F4A',
  brandSoft: '#E2F3F0',
  amber: '#F59E0B',
  ok: '#15803D',
  okBg: '#E3F6E9',
  warn: '#B45309',
  warnBg: '#FEF1D6',
  bad: '#B91C1C',
  badBg: '#FDE8E8',
  idleBg: '#EDF2F0',
};

/* ---------- icons (simple line icons) ---------- */

const ICONS: Record<string, string[]> = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  route: ['M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M8 17h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6'],
  bell: ['M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  wallet: ['M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2', 'M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z', 'M16 14.5h.01'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  plus: ['M12 5v14', 'M5 12h14'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  phone: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
  skip: ['M5 4l10 8-10 8z', 'M19 5v14'],
  more: ['M12 6h.01', 'M12 12h.01', 'M12 18h.01'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
  minus: ['M5 12h14'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronUp: ['M18 15l-6-6-6 6'],
  zap: ['M13 2 3 14h9l-1 8 10-12h-9z'],
  grip: ['M9 6h.01', 'M15 6h.01', 'M9 12h.01', 'M15 12h.01', 'M9 18h.01', 'M15 18h.01'],
};

export function Icon({ name, size = 22, color = C.ink, stroke = 2 }: { name: keyof typeof ICONS | string; size?: number; color?: string; stroke?: number }) {
  const paths = ICONS[name] ?? [];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => (
        <Path key={i} d={d} />
      ))}
      {name === 'search' ? null : null}
    </Svg>
  );
}

export function Dot({ size = 10, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      <Circle cx="5" cy="5" r="5" fill={color} />
    </Svg>
  );
}

/* ---------- layout ---------- */

export function Card({ children, style, highlight }: { children: ReactNode; style?: ViewStyle; highlight?: boolean }) {
  return <View style={[s.card, highlight && { borderWidth: 1.5, borderColor: C.brand }, style]}>{children}</View>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

type Tone = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Btn({
  label,
  onPress,
  tone = 'primary',
  small,
  disabled,
  style,
  icon,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  small?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: string;
}) {
  const bg = tone === 'primary' ? C.brand : tone === 'danger' ? C.badBg : tone === 'ghost' ? 'transparent' : C.brandSoft;
  const fg = tone === 'primary' ? '#fff' : tone === 'danger' ? C.bad : tone === 'ghost' ? C.muted : C.brand;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {!!icon && <Icon name={icon} size={small ? 16 : 20} color={fg} />}
        <Text style={[s.btnText, small && { fontSize: 14 }, { color: fg }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function Chip({ label, tone }: { label: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const bg = tone === 'ok' ? C.okBg : tone === 'warn' ? C.warnBg : tone === 'bad' ? C.badBg : C.idleBg;
  const fg = tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : tone === 'bad' ? C.bad : C.muted;
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#9AA8A4" style={[s.input, style]} {...props} />
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={[s.label, { marginTop: 16 }]}>{children}</Text>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={s.empty}>{children}</Text>;
}

/** Two or three choices in one pill-shaped switch. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={s.segWrap}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.seg, on && s.segOn]}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: on ? C.brand : C.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, color = '#fff', track = 'rgba(255,255,255,0.25)' }: { value: number; color?: string; track?: string }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: Math.max(0, Math.min(1, value)), duration: 450, useNativeDriver: false }).start();
  }, [value, w]);
  return (
    <View style={{ height: 8, borderRadius: 99, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={{ height: 8, borderRadius: 99, backgroundColor: color, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

/**
 * A full-screen sheet for forms. The action button in `footer` stays above the keyboard,
 * so the driver never has to hunt for it.
 */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
  scroll = true,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Set false when the body is a list that scrolls by itself. */
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.sheetHead, { paddingTop: insets.top + 10 }]}>
          <Text style={s.sheetTitle} numberOfLines={1}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={14} style={s.closeBtn}>
            <Icon name="x" size={20} color={C.ink} />
          </Pressable>
        </View>
        {scroll ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
        {footer && <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View>}
        {!footer && <View style={{ height: insets.bottom }} />}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 8 };

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#0A2420',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  h2: { fontSize: 13, fontWeight: '800', color: C.muted, marginTop: 20, marginBottom: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  muted: { color: C.muted, fontSize: 14, lineHeight: 20 },
  btn: { borderRadius: 16, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12 },
  btnText: { fontSize: 16, fontWeight: '700' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, alignSelf: 'flex-start' },
  label: { fontSize: 13, fontWeight: '600', color: C.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 17,
    color: C.ink,
    backgroundColor: '#fff',
  },
  empty: { textAlign: 'center', color: C.muted, paddingVertical: 24 },
  segWrap: { flexDirection: 'row', backgroundColor: C.idleBg, borderRadius: 16, padding: 4 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12 },
  segOn: { backgroundColor: '#fff', shadowColor: '#0A2420', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sheetHead: { paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { flex: 1, color: C.ink, fontSize: 26, fontWeight: '800', marginRight: 12 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
});

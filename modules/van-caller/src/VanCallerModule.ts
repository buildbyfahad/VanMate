import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export interface PlanEntry {
  key: string; // unique per child per day, e.g. "2026-11-06|<studentId>"
  at: number; // epoch ms the phone should call
  number: string; // e.g. +919876543210
}

export interface Sim {
  id: string;
  label: string;
  selected: boolean;
}

export interface LogEntry {
  key: string;
  at: number;
  ok: boolean;
  note: string;
  /** What really happened: talked, unanswered, cut, called (result unknown) or notstarted. */
  outcome?: string;
  /** Seconds they spoke, when answered. */
  talkSec?: number;
}

declare class VanCallerNative extends NativeModule<{}> {
  setPlan(json: string): void;
  getLog(): string;
  hasPermissions(): boolean;
  hasCallLogPermission(): boolean;
  nextAlarmAt(): number;
  getSims(): string;
  setSim(id: string | null): void;
  callNow(key: string, number: string): boolean;
  openBatterySettings(): void;
  openAppSettings(): void;
}

// Only Android can dial by itself; elsewhere the module is simply absent.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<VanCallerNative>('VanCaller') : null;

export const autoCallSupported = native !== null;

export const VanCaller = {
  setPlan: (plan: PlanEntry[]) => native?.setPlan(JSON.stringify(plan)),
  getLog: (): LogEntry[] => {
    try {
      return native ? (JSON.parse(native.getLog()) as LogEntry[]) : [];
    } catch {
      return [];
    }
  },
  hasPermissions: () => native?.hasPermissions() ?? false,
  hasCallLogPermission: () => native?.hasCallLogPermission() ?? false,
  nextAlarmAt: () => native?.nextAlarmAt() ?? 0,
  getSims: (): Sim[] => {
    try {
      return native ? (JSON.parse(native.getSims()) as Sim[]) : [];
    } catch {
      return [];
    }
  },
  setSim: (id: string | null) => native?.setSim(id),
  callNow: (key: string, number: string) => native?.callNow(key, number) ?? false,
  openBatterySettings: () => native?.openBatterySettings(),
  openAppSettings: () => native?.openAppSettings(),
};

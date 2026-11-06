import { Alert, Linking } from 'react-native';
import { Lang } from './types';
import { normalizePhone } from './phone';

export { normalizePhone };

interface Ctx {
  parent: string;
  child: string;
  driver: string;
}

const T = {
  hi: {
    fee: (c: Ctx, month: string, fee: number, upi: string) =>
      `नमस्ते ${c.parent} जी, ${c.child} की ${month} की वैन फीस ₹${fee} बाकी है।${upi ? ` UPI: ${upi}` : ''} धन्यवाद। - ${c.driver}`,
  },
  en: {
    fee: (c: Ctx, month: string, fee: number, upi: string) =>
      `Hello ${c.parent}, the van fee of Rs ${fee} for ${c.child} for ${month} is pending.${upi ? ` UPI: ${upi}` : ''} Thank you. - ${c.driver}`,
  },
} as const;

export const msg = {
  fee: (lang: Lang, c: Ctx, month: string, fee: number, upi: string) => T[lang].fee(c, month, fee, upi),
};

/** Opens WhatsApp with the message pre-filled; the driver only presses send. */
export async function sendWhatsApp(phone: string, text: string): Promise<void> {
  const url = `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open WhatsApp', 'Is WhatsApp installed on this phone?');
  }
}

export async function callPhone(phone: string): Promise<void> {
  try {
    await Linking.openURL(`tel:+${normalizePhone(phone)}`);
  } catch {
    Alert.alert('Could not start the call');
  }
}

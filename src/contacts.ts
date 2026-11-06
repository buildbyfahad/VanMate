import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { normalizePhone } from './phone';

export interface PhoneContact {
  id: string;
  name: string;
  numbers: string[]; // normalized, digits with country code
}

/** Asks for permission to read contacts if needed. Returns true when the app may read them. */
export async function ensureContactsPermission(): Promise<boolean> {
  const current = await getPermissionsAsync();
  if (current.granted) return true;
  const asked = await requestPermissionsAsync();
  return asked.granted;
}

/** Everyone in the phone's address book who has a number, sorted by name. Read once, kept on the phone only. */
export async function loadContacts(): Promise<PhoneContact[]> {
  const all = await Contact.getAllDetails([ContactField.GIVEN_NAME, ContactField.FAMILY_NAME, ContactField.PHONES] as const);
  const out: PhoneContact[] = [];
  all.forEach((c, i) => {
    const numbers = [...new Set((c.phones ?? []).map((p) => normalizePhone(p.number ?? '')).filter((n) => n.length >= 10))];
    if (numbers.length === 0) return;
    const name = [c.givenName, c.familyName].filter(Boolean).join(' ').trim();
    out.push({ id: String(i), name: name || `+${numbers[0]}`, numbers });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type Lang = 'hi' | 'en';

export interface Route {
  id: string;
  name: string;
  days: number[]; // weekdays it runs, Sunday = 0
}

export interface Student {
  id: string;
  routeId: string;
  child: string;
  parent: string;
  phone: string; // main number, digits with country code
  extraPhones?: string[]; // more numbers to call for this student (e.g. the other parent)
  fee: number; // monthly, rupees
  order: number; // position in the route; the list is called from top to bottom
  gapMin: number; // call this student this many minutes after the previous one (ignored for the first, who is called at once)
}

export interface Payment {
  mode: 'cash' | 'upi';
  paidOn: number; // epoch ms
}

export interface Settings {
  driver: string;
  upi: string;
  lang: Lang;
}

export interface Data {
  settings: Settings;
  routes: Route[];
  students: Student[];
  /** key = YYYY-MM-DD, value = ids of students who are absent that day */
  absences: Record<string, string[]>;
  /** key = `${date}|${routeId}`, value = epoch ms the driver started that run */
  started: Record<string, number>;
  /** key = `${date}|${routeId}` */
  cancelled: Record<string, boolean>;
  /** key = `${studentId}:${YYYY-MM}` */
  payments: Record<string, Payment>;
}

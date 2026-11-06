export type Lang = 'hi' | 'en';

export interface CallRequest {
  to: string; // digits with country code, e.g. 919876543210
  parent: string;
  child: string;
  driver: string;
  lang: Lang;
}

export interface Voice {
  name: string;
  call(req: CallRequest): Promise<{ sid: string }>;
}

/** What the parent hears. Kept short: parents pick up, listen, and send the child out. */
export function script(req: Pick<CallRequest, 'parent' | 'child' | 'driver' | 'lang'>): string {
  if (req.lang === 'en') {
    return `Hello ${req.parent}. Please get ${req.child} ready. The van is coming to your stop shortly. This is ${req.driver}.`;
  }
  return `नमस्ते ${req.parent} जी। ${req.child} को तैयार कर लीजिए। वैन थोड़ी देर में आपके स्टॉप पर पहुँच रही है। ${req.driver}।`;
}

/** Test mode: no real calls, just remembers them. Safe default. */
export class MockVoice implements Voice {
  name = 'mock';
  calls: CallRequest[] = [];
  failNext = 0;
  async call(req: CallRequest) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('mock provider failure');
    }
    this.calls.push(req);
    console.log(`[mock call] +${req.to}: ${script(req)}`);
    return { sid: `mock-${this.calls.length}` };
  }
}

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Real calls through Twilio's REST API. The message is sent inline as TwiML, so no public
 * webhook URL is needed. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.
 */
export class TwilioVoice implements Voice {
  name = 'twilio';
  constructor(
    private sid: string,
    private token: string,
    private from: string,
  ) {}

  async call(req: CallRequest) {
    const text = xml(script(req));
    const language = req.lang === 'hi' ? 'hi-IN' : 'en-IN';
    const twiml = `<Response><Say language="${language}">${text}</Say><Pause length="1"/><Say language="${language}">${text}</Say></Response>`;
    const body = new URLSearchParams({ To: `+${req.to}`, From: this.from, Twiml: twiml });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${this.sid}:${this.token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok || !json.sid) throw new Error(json.message ?? `Twilio error ${res.status}`);
    return { sid: json.sid };
  }
}

export function voiceFromEnv(env = process.env): Voice {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = env;
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) {
    return new TwilioVoice(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM);
  }
  console.warn('No TWILIO_* settings found: running in TEST MODE, no real calls will be placed.');
  return new MockVoice();
}

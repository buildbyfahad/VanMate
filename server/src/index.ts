import { mkdirSync } from 'node:fs';
import { openDb } from './db.js';
import { voiceFromEnv } from './voice.js';
import { buildApp } from './app.js';
import { startScheduler } from './scheduler.js';

mkdirSync('data', { recursive: true });
const db = openDb(process.env.DB_PATH ?? 'data/vanmate.db');
const voice = voiceFromEnv();
const app = buildApp(db, voice);
startScheduler(db, voice);

const port = Number(process.env.PORT ?? 4100);
await app.listen({ port, host: '0.0.0.0' });
console.log(`VanMate server on :${port} · calls: ${voice.name} · timezone: ${process.env.TZ ?? 'system'}`);

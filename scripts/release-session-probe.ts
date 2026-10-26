import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { releaseSmokeConfiguration } from './release-smoke-config.ts';

const [mode, file] = process.argv.slice(2);
if (!file || !['start', 'verify', 'finish'].includes(mode ?? ''))
  throw Error('Uso: release-session-probe start|verify|finish arquivo-privado');
const configuration = releaseSmokeConfiguration();
const client = new ConvexHttpClient(configuration.backendUrl);
if (mode === 'start') {
  const session = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { email: configuration.email, password: configuration.password, flow: 'signIn' },
  });
  if (!session.tokens?.token) throw Error('A sessão de conferência não foi criada.');
  client.setAuth(session.tokens.token);
  try {
    const identity = await client.query(api.access.session.me, {});
    if (
      identity?.id !== configuration.userId ||
      identity.role !== 'ADMIN' ||
      identity.loginMethod !== 'local'
    )
      throw Error('A sessão não pertence à conta operacional.');
    writeFileSync(file, JSON.stringify({ token: session.tokens.token, userId: identity.id }), {
      mode: 0o600,
      flag: 'wx',
    });
  } catch (error) {
    await client.action(api.auth.signOut, {}).catch(() => undefined);
    throw error;
  }
} else if (existsSync(file)) {
  const session = JSON.parse(readFileSync(file, 'utf8')) as { token: string; userId: string };
  client.setAuth(session.token);
  if (mode === 'finish') {
    try {
      await client.action(api.auth.signOut, {});
    } finally {
      rmSync(file);
    }
  } else {
    const identity = await client.query(api.access.session.me, {});
    if (identity?.id !== session.userId || identity.id !== configuration.userId)
      throw Error('A sessão anterior ao deploy deixou de ser válida. Promoção bloqueada.');
  }
} else if (mode === 'verify') throw Error('A sessão anterior ao deploy não está disponível.');

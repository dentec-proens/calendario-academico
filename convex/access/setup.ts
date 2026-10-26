import { withActionLease } from '../lib/maintenance';
import { internal } from '../_generated/api';
import { action, internalMutation } from '../_generated/server';
import { setupInput } from '../authContracts';
import { passwordCrypto } from '../authCrypto';
import { institutionalEmail } from './identity';
import { appendAudit, setPassword } from './store';
import { v } from 'convex/values';

export const setup = action({
  args: { data: setupInput },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { data }): Promise<{ ok: boolean }> =>
    withActionLease(ctx, 'access.setup.setup', async () => {
      const email = institutionalEmail(data.email);
      if (
        !process.env.DENTEC_SETUP_CODE ||
        data.code !== process.env.DENTEC_SETUP_CODE ||
        (process.env.DENTEC_SETUP_EMAIL && email !== process.env.DENTEC_SETUP_EMAIL.toLowerCase())
      )
        throw Error('Código ou e-mail de instalação incorreto.');
      return ctx.runMutation(internal.access.setup.setupRecord, {
        email,
        name: data.name,
        secret: await passwordCrypto.hashSecret(data.password),
      });
    }),
});

export const setupRecord = internalMutation({
  args: { email: v.string(), name: v.string(), secret: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { email, name, secret }) => {
    if (await ctx.db.query('users').first()) throw Error('Conta ADMIN já criada.');
    if (!name.trim() || name.length > 240) throw Error('Informe seu nome.');
    const id = await ctx.db.insert('users', {
      name: name.trim(),
      email,
      role: 'ADMIN',
      active: true,
      loginMethod: 'local',
    });
    await setPassword(ctx, (await ctx.db.get(id))!, secret);
    await appendAudit(ctx, id, 'CREATE_ADMIN', id);
    return { ok: true };
  },
});

import { assertWritesOpen } from './lib/maintenance';
import { mutation } from './_generated/server';
import { requireNativeUser } from './access/identity';
import * as contracts from './contracts';
import { appendAudit } from './lib/audit';
import { admin } from './lib/authorization';
import { fail, text } from './lib/shared';
import { v } from 'convex/values';

export const createCampus = mutation({
  args: { name: v.string() },
  returns: contracts.campusDto,
  handler: async (ctx, { name }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    admin(user);
    name = text(name, 120);
    const rows = await ctx.db.query('campuses').withIndex('by_name').take(501);
    if (rows.length > 500) fail('Limite de unidades excedido.');
    if (rows.some((r) => r.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')))
      fail('Unidade já cadastrada.', 409);
    const id = await ctx.db.insert('campuses', { name, archived: false });
    await appendAudit(ctx, user, 'CREATE_CAMPUS', { type: 'campus', id });
    return { id, name, archived: false };
  },
});

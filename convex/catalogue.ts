import { assertWritesOpen } from './lib/maintenance';
import { datesBetween } from '../src/domain/calendar/counting/core';
import { validCategory } from '../src/domain/calendar/activities/categories';
import { mutation } from './_generated/server';
import { requireNativeUser } from './access/identity';
import { globalRevision, bumpRevision } from './catalogue/model';
import * as contracts from './contracts';
import { appendAudit } from './lib/audit';
import { admin } from './lib/authorization';
import { fail, text } from './lib/shared';
import { v } from 'convex/values';

const ok = v.object({ ok: v.boolean() });

export const saveCatalogue = mutation({
  args: { body: contracts.catalogueInput },
  returns: ok,
  handler: async (ctx, { body }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    admin(user);
    if (body.revision !== (await globalRevision(ctx)))
      fail('Base atualizada por outra sessão. Recarregue.', 409);
    datesBetween(body.start, body.end);
    if (
      body.start.slice(0, 4) !== body.end.slice(0, 4) ||
      !validCategory(body.category) ||
      !body.modalities.length
    )
      fail('Datas, efeito ou ofertas inválidos.');
    const prior = body.id
      ? await ctx.db
          .query('institutionalEvents')
          .withIndex('by_code', (q) => q.eq('code', body.id!))
          .unique()
      : null;
    const year = Number(body.start.slice(0, 4)),
      code = body.id ?? crypto.randomUUID();
    text(code, 100);
    const fields = {
      code,
      year,
      name: text(body.name, 160),
      start: body.start,
      end: body.end,
      kind: body.kind,
      category: text(body.category, 40),
      evidence: text(body.evidence),
      modalities: body.modalities,
      active: body.active,
    };
    const id = prior ? prior._id : await ctx.db.insert('institutionalEvents', fields);
    if (prior) await ctx.db.replace(prior._id, fields);
    await bumpRevision(ctx, year);
    if (prior && prior.year !== year) await bumpRevision(ctx, prior.year);
    await appendAudit(ctx, user, 'UPDATE_CATALOGUE', { type: 'institutionalEvent', id });
    return { ok: true };
  },
});

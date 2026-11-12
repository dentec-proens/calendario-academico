import { readDateRange } from '../src/domain/calendar/civil-dates.ts';
import { longRange } from '../src/domain/date-labels.ts';
import { assertWritesOpen } from './lib/maintenance';
import { datesBetween } from '../src/domain/calendar/counting/core';
import { validCategory } from '../src/domain/calendar/activities/categories';
import { contentIssues } from '../src/domain/calendar/readiness';
import { applicableEvents } from '../src/domain/calendar/base';
import { readActivityDates } from '../src/domain/calendar/civil-dates.ts';
import { isEditable } from '../src/domain/calendar/lifecycle';
import { equalValues } from '../src/shared/equal';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { contents } from './calendars/model';
import type { DomainState } from './validators';
import { requireNativeUser } from './access/identity';
import { bumpRevision, catalogue, globalRevision } from './catalogue/model';
import * as contracts from './contracts';
import { appendAudit } from './lib/audit';
import { admin } from './lib/authorization';
import { fail, text } from './lib/shared';
import { v } from 'convex/values';
import { validateObservanceCatalogueEvent } from '../src/domain/calendar/observances';
import { domainRule } from './lib/shared';

const ok = v.object({ ok: v.boolean() });

const impactCalendars = 1000;
const impactContents = 100;

/** What the audit shows of a change: there is no catalogue draft, so a typo must be easy to spot. */
function catalogueChange(
  prior: Pick<Doc<'institutionalEvents'>, 'name' | 'start' | 'end' | 'effect' | 'active'> | null,
  next: Pick<Doc<'institutionalEvents'>, 'name' | 'start' | 'end' | 'effect' | 'active'>,
) {
  if (!prior) return `${next.name}, ${longRange(next)}: incluído`;
  const changes = [
    ...(prior.name === next.name ? [] : [`nome era ${prior.name}`]),
    ...(longRange(prior) === longRange(next)
      ? []
      : [`de ${longRange(prior)} para ${longRange(next)}`]),
    ...(prior.effect === next.effect ? [] : [`efeito de ${prior.effect} para ${next.effect}`]),
    ...(prior.active === next.active ? [] : [next.active ? 'reativado' : 'desativado']),
  ];
  return `${next.name}: ${changes.join('; ') || 'detalhes alterados'}`;
}

/**
 * How many calendars in editing a change reaches. They follow the base as soon as it is saved and
 * nobody confirms it for them, so the administration sees the reach before confirming.
 */
export const catalogueImpact = query({
  args: { body: contracts.catalogueInput },
  returns: v.object({ reached: v.number(), withNewIssues: v.number(), partial: v.boolean() }),
  handler: async (ctx, { body }) => {
    const { user } = await requireNativeUser(ctx);
    admin(user);
    const year = Number(body.start.slice(0, 4));
    const code = body.id ?? 'novo-evento';
    const prior = body.id
      ? await ctx.db
          .query('institutionalEvents')
          .withIndex('by_code', (q) => q.eq('code', body.id!))
          .unique()
      : null;
    let reached = 0;
    let withNewIssues = 0;
    let examined = 0;
    let partial = false;
    // Moving an event to another year also takes it away from the calendars of the old one.
    for (const scope of new Set([year, prior?.year ?? year])) {
      const current = await catalogue(ctx, scope);
      const remaining = current.events.filter((event) => event.id !== code);
      const changed = {
        ...current,
        events:
          scope === year
            ? [...remaining, { ...body, ...readDateRange(body), id: code, year }]
            : remaining,
      };
      const calendars = await ctx.db
        .query('calendars')
        .withIndex('by_year', (q) => q.eq('year', scope))
        .take(impactCalendars);
      if (calendars.length === impactCalendars) partial = true;
      for (const row of calendars) {
        if (row.deletedAt !== undefined || !isEditable(row.status)) continue;
        // Contents are large: past this the answer says "at least" instead of hitting read limits.
        if (examined === impactContents) {
          partial = true;
          break;
        }
        examined++;
        const content = await contents(ctx, row._id);
        const state = { ...content.state, year: scope, campus: '' } as DomainState;
        const before = applicableEvents(current, state);
        const after = applicableEvents(changed, state);
        if (equalValues(before, after)) continue;
        reached++;
        const issues = (events: typeof before) =>
          new Set(
            contentIssues(state, events.map(readActivityDates) as never).map((issue) => issue.key),
          );
        const known = issues(before);
        if ([...issues(after)].some((issue) => !known.has(issue))) withNewIssues++;
      }
    }
    return { reached, withNewIssues, partial };
  },
});

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
      effect: body.effect,
      category: text(body.category, 40),
      evidence: text(body.evidence),
      modalities: body.modalities,
      active: body.active,
    };
    domainRule(() => validateObservanceCatalogueEvent(readDateRange(fields), prior));
    const id = prior ? prior._id : await ctx.db.insert('institutionalEvents', fields);
    if (prior) await ctx.db.replace(prior._id, fields);
    await bumpRevision(ctx, year);
    if (prior && prior.year !== year) await bumpRevision(ctx, prior.year);
    await appendAudit(
      ctx,
      user,
      'UPDATE_CATALOGUE',
      { type: 'institutionalEvent', id },
      { details: catalogueChange(prior, fields) },
    );
    return { ok: true };
  },
});

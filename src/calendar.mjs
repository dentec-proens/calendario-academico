/** Pure civil-date counting core. Not a complete institutional validator. */
const DAY = 86400000;
export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Data deve usar YYYY-MM-DD');
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new RangeError('Data civil inválida');
  return time;
}
export function datesBetween(start, end) {
  const a = parseDate(start), b = parseDate(end);
  if (a > b) throw new RangeError('Intervalo invertido');
  if ((b - a) / DAY > 732) throw new RangeError('Intervalo excede o limite do núcleo inicial');
  return Array.from({length: (b - a) / DAY + 1}, (_, i) => new Date(a + i * DAY).toISOString().slice(0, 10));
}
function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`Campo obrigatório: ${field}`);
}
function minimum(value) {
  if (value !== null && (!Number.isInteger(value) || value < 0)) throw new TypeError('Mínimo deve ser inteiro não negativo ou null');
}
function confirmed(record) {
  if (record.confirmed !== true) throw new TypeError('Configuração não confirmada');
  requiredString(record.evidenceId, 'evidenceId');
}
/**
 * periods must be disjoint terms at ONE level, not both semesters and subterms.
 * weekPattern represents pedagogically confirmed ordinary teaching days.
 * This core trusts confirmation IDs supplied by its authenticated caller.
 * The future backend must resolve and authorize real evidence records.
 */
export function countCalendar(input) {
  const {year, offerId, periods, weekPattern, inclusions, exclusions, thresholds} = input;
  if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new RangeError('Ano inválido');
  requiredString(offerId, 'offerId');
  if (!Array.isArray(periods) || periods.length === 0) throw new TypeError('Informe períodos');
  if (!Array.isArray(inclusions) || !Array.isArray(exclusions)) throw new TypeError('Informe inclusões e exclusões explicitamente');
  confirmed(weekPattern);
  if (!Array.isArray(weekPattern.weekdays) || new Set(weekPattern.weekdays).size !== weekPattern.weekdays.length || weekPattern.weekdays.some(x => !Number.isInteger(x) || x < 1 || x > 5)) {
    throw new TypeError('Semana ordinária deve conter dias únicos entre segunda (1) e sexta (5); finais de semana exigem inclusão explícita');
  }
  minimum(thresholds.annual);
  if (!thresholds.byPeriod || typeof thresholds.byPeriod !== 'object') throw new TypeError('Informe mínimos por período');
  const periodIds = new Set(), owner = new Map();
  for (const period of periods) {
    requiredString(period.id, 'period.id');
    if (periodIds.has(period.id)) throw new TypeError('Período duplicado');
    periodIds.add(period.id);
    minimum(thresholds.byPeriod[period.id]);
    for (const date of datesBetween(period.start, period.end)) {
      if (Number(date.slice(0, 4)) !== year) throw new RangeError('Período fora do ano letivo deste núcleo');
      if (owner.has(date)) throw new RangeError('Períodos sobrepostos no mesmo nível');
      owner.set(date, period.id);
    }
  }
  if (Object.keys(thresholds.byPeriod).some(id => !periodIds.has(id))) throw new TypeError('Mínimo para período desconhecido');
  const add = new Map(), block = new Map(), eventIds = new Set();
  for (const [records, target, kind] of [[inclusions, add, 'include'], [exclusions, block, 'exclude']]) {
    for (const record of records) {
      requiredString(record.id, 'event.id');
      if (eventIds.has(record.id)) throw new TypeError('Identificador de evento duplicado');
      eventIds.add(record.id);
      confirmed(record);
      if (!Array.isArray(record.offerIds) || !record.offerIds.length || record.offerIds.some(id => typeof id !== 'string' || !id.trim())) throw new TypeError('Escopo de oferta obrigatório');
      const dates = datesBetween(record.start, record.end);
      if (!record.offerIds.includes(offerId)) continue;
      for (const date of dates) {
        if (kind === 'include' && !owner.has(date)) throw new RangeError('Inclusão letiva fora dos períodos');
        if (!owner.has(date)) continue;
        if (!target.has(date)) target.set(date, []);
        target.get(date).push({id: record.id, evidenceId: record.evidenceId});
      }
    }
  }
  const ledger = [], conflicts = [];
  const byPeriod = Object.fromEntries(periods.map(p => [p.id, 0]));
  const byWeekday = Object.fromEntries([0,1,2,3,4,5,6].map(d => [d, 0]));
  for (const [date, periodId] of [...owner.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const weekday = new Date(parseDate(date)).getUTCDay();
    const ordinary = weekPattern.weekdays.includes(weekday);
    const additions = add.get(date) ?? [], blockers = block.get(date) ?? [];
    const counted = (ordinary || additions.length > 0) && blockers.length === 0;
    if (additions.length && blockers.length) conflicts.push({date, code:'INCLUSION_BLOCKED', inclusionIds:additions.map(x=>x.id), exclusionIds:blockers.map(x=>x.id)});
    if (counted) { byPeriod[periodId]++; byWeekday[weekday]++; }
    ledger.push({date, periodId, weekday, counted, reason: blockers.length ? 'EXCLUDED' : additions.length ? 'EXPLICIT' : ordinary ? 'WEEK_PATTERN' : 'NO_TEACHING', evidenceIds: [...new Set([...(ordinary ? [weekPattern.evidenceId] : []), ...additions.map(x=>x.evidenceId), ...blockers.map(x=>x.evidenceId)])]});
  }
  const total = Object.values(byPeriod).reduce((a,b)=>a+b,0);
  const checks = [{scope:'annual', observed:total, expected:thresholds.annual}, ...periods.map(p=>({scope:p.id, observed:byPeriod[p.id], expected:thresholds.byPeriod[p.id]}))].map(c=>({...c, status:c.expected === null ? 'NOT_VERIFIABLE' : c.observed >= c.expected ? 'MET' : 'NOT_MET'}));
  return {year, offerId, total, byPeriod, byWeekday, ledger, conflicts, checks, institutionalValidation:'INCOMPLETE', officialApproval:false};
}

/** Caller supplies the already verified teaching-date set for this offer. */
export function firstTeachingDateAfter(date, teachingDates) {
  parseDate(date);
  for (const item of teachingDates) parseDate(item);
  return [...new Set(teachingDates)].sort().find(d => d > date) ?? null;
}
export function daysBefore(date, days) {
  if (!Number.isInteger(days) || days < 0) throw new TypeError('Antecedência inválida');
  return new Date(parseDate(date) - days * DAY).toISOString().slice(0,10);
}

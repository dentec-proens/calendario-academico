import { expect, test } from 'vitest';
import {
  calendarStatuses,
  canCreateVersion,
  canTransition,
  fileNamePrefix,
  isDeletable,
  lifecycleActions,
  officialApproval,
  printMark,
  transition,
  validSei,
  type CalendarStatus,
  type LifecycleAction,
  type LifecycleRole,
} from '../../src/domain/calendar/lifecycle.ts';

const roles: LifecycleRole[] = ['CAMPUS', 'PARECERISTA', 'ADMIN'];
const table: Record<
  LifecycleAction,
  {
    from: CalendarStatus[];
    to: CalendarStatus | 'origin';
    role: 'CAMPUS' | 'PARECERISTA' | 'ADMIN';
  }
> = {
  submit: { from: ['rascunho', 'devolvido'], to: 'enviado', role: 'CAMPUS' },
  withdraw: { from: ['enviado'], to: 'origin', role: 'CAMPUS' },
  startReview: { from: ['enviado'], to: 'em_revisao', role: 'PARECERISTA' },
  return: { from: ['enviado', 'em_revisao', 'revisado'], to: 'devolvido', role: 'PARECERISTA' },
  conclude: { from: ['em_revisao'], to: 'revisado', role: 'PARECERISTA' },
  reopen: { from: ['revisado'], to: 'em_revisao', role: 'PARECERISTA' },
  publish: { from: ['revisado'], to: 'vigente', role: 'ADMIN' },
  archive: { from: ['vigente'], to: 'arquivado', role: 'ADMIN' },
  reinstate: { from: ['arquivado'], to: 'vigente', role: 'ADMIN' },
};

test('every status, action and role follows the transition table, and the admin never jumps', () => {
  for (const action of lifecycleActions)
    for (const status of calendarStatuses)
      for (const role of roles) {
        const rule = table[action];
        const permitted = rule.from.includes(status) && (role === 'ADMIN' || role === rule.role);
        expect(canTransition(status, action, role), `${action} ${status} ${role}`).toBe(permitted);
        if (permitted) {
          const result = transition(status, action, role, 'devolvido');
          expect(result).toBe(rule.to === 'origin' ? 'devolvido' : rule.to);
        } else expect(() => transition(status, action, role, 'rascunho')).toThrow();
      }
});

test('a refused transition outside the table is a conflict, a refused role is invalid', () => {
  expect(() => transition('vigente', 'submit', 'ADMIN')).toThrow(
    expect.objectContaining({ status: 409 }),
  );
  expect(() => transition('revisado', 'publish', 'PARECERISTA')).toThrow(
    expect.objectContaining({ status: 400 }),
  );
  expect(() => transition('enviado', 'withdraw', 'CAMPUS')).toThrow(/origem/);
  expect(transition('enviado', 'withdraw', 'CAMPUS', 'rascunho')).toBe('rascunho');
});

test('versions, deletion, approval, marks and file names depend only on status', () => {
  expect(canCreateVersion('vigente', 'CAMPUS')).toBe(true);
  expect(canCreateVersion('vigente', 'ADMIN')).toBe(true);
  expect(canCreateVersion('vigente', 'PARECERISTA')).toBe(false);
  expect(canCreateVersion('revisado', 'CAMPUS')).toBe(false);
  expect(calendarStatuses.filter(isDeletable)).toEqual(['rascunho', 'devolvido']);
  expect(calendarStatuses.filter(officialApproval)).toEqual(['vigente']);
  expect(printMark('rascunho')).toBe('Rascunho — sem validade');
  expect(printMark('enviado')).toBe(printMark('em_revisao'));
  expect(printMark('vigente', { seiProcess: '23411.000001/2027-11' })).toBe(
    'Processo SEI nº 23411.000001/2027-11',
  );
  expect(printMark('arquivado', { supersededByName: 'Calendário 2027 - Campus A' })).toBe(
    'Substituído por Calendário 2027 - Campus A',
  );
  expect(printMark('arquivado')).toBe('Arquivado');
  expect(fileNamePrefix('vigente')).toBe('');
  expect(fileNamePrefix('em_revisao')).toBe('em-revisao-');
});

test('the SEI process follows the institutional format', () => {
  expect(validSei(' 23411.000001/2027-11 ')).toBe('23411.000001/2027-11');
  expect(() => validSei('23411.1/2027')).toThrow(/00000\.000000\/0000-00/);
});

import { civilDate } from '../../civil-date.ts';
import type { ObservanceRule } from '../contract.ts';

export const observances: readonly ObservanceRule[] = [
  {
    key: 'teacher-day',
    eventCode: 'ifpr2027-16',
    label: 'Dia do Professor',
    allowed: { kind: 'range', start: civilDate('2027-07-01'), end: civilDate('2027-12-31') },
    basis:
      'Resolução 292: o Dia do Professor poderá ser ajustado de acordo com a organização do campus. Decisão da gestão do sistema em 25/11/2026: qualquer data do segundo semestre de 2027.',
  },
  {
    key: 'public-servant-day',
    eventCode: 'ifpr2027-17',
    label: 'Dia do Servidor Público',
    allowed: { kind: 'list', dates: [civilDate('2027-10-28'), civilDate('2027-10-29')] },
    basis:
      'Decisão da gestão do sistema em 30/10/2026: observância em 28 ou 29 de outubro de 2027, conforme definição do campus.',
  },
];

import { civilDate } from '../../civil-date.ts';
import type { ObservanceRule } from '../contract.ts';

export const observances: readonly ObservanceRule[] = [
  {
    key: 'teacher-day',
    eventCode: 'ifpr2027-16',
    label: 'Dia do Professor',
    allowedDates: [
      civilDate('2027-10-11'),
      civilDate('2027-10-12'),
      civilDate('2027-10-13'),
      civilDate('2027-10-14'),
      civilDate('2027-10-15'),
      civilDate('2027-10-16'),
      civilDate('2027-10-17'),
    ],
    basis: 'Escolha do campus na semana de 15 de outubro, de segunda-feira a domingo.',
  },
  {
    key: 'public-servant-day',
    eventCode: 'ifpr2027-17',
    label: 'Dia do Servidor Público',
    allowedDates: [civilDate('2027-10-28'), civilDate('2027-10-29')],
    basis:
      'Decisão da gestão do sistema em 30/10/2026: observância em 28 ou 29 de outubro de 2027, conforme definição do campus.',
  },
];

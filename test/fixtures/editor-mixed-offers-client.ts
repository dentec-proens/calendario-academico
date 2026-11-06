import { civilDate } from '../../src/domain/civil-date.ts';
import { record } from './editor-offer-without-periods-client.ts';
export { convex, functions } from './editor-offer-without-periods-client.ts';

/** Undergraduate semesters leave July out, while the integrated offer has classes all year. */
record.state.periods = [
  ...record.state.periods,
  {
    id: 'first',
    name: '1º semestre',
    start: civilDate('2027-03-01'),
    end: civilDate('2027-07-09'),
    association: { status: 'defined', offers: ['graduacao'], term: 'first' },
  },
  {
    id: 'second',
    name: '2º semestre',
    start: civilDate('2027-08-02'),
    end: civilDate('2027-12-17'),
    association: { status: 'defined', offers: ['graduacao'], term: 'second' },
  },
];

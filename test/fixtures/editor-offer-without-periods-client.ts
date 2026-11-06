import { civilDate } from '../../src/domain/civil-date.ts';
import { record } from './editor-client.ts';
export { convex, functions, record } from './editor-client.ts';

/** The integrated offer has its year; the undergraduate one has no periods yet. */
record.offerKinds = ['integrado', 'graduacao'];
record.state.offers = [
  { id: 'integrado', kind: 'integrado', delivery: 'a-conferir', organization: 'anual' },
  { id: 'graduacao', kind: 'graduacao', delivery: 'a-conferir', organization: 'semestral' },
];
record.state.periods = [
  {
    id: 'year',
    name: 'Ano letivo',
    start: civilDate('2027-02-01'),
    end: civilDate('2027-12-17'),
    association: { status: 'defined', offers: ['integrado'], term: 'annual' },
  },
];

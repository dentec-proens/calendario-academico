import { civilDate } from '../../src/domain/civil-date.ts';
import { record } from './editor-client.ts';
export { convex, functions } from './editor-reviewer-client.ts';
record.state.periods = [
  {
    id: 'year',
    name: 'Ano letivo',
    start: civilDate('2027-02-01'),
    end: civilDate('2027-12-17'),
    association: { status: 'defined', offers: ['integrado'], term: 'annual' },
  },
];
record.state.events.push({
  id: 'reviewed-saturday',
  name: 'Reposição de aulas',
  kind: 'include',
  category: 'sabado',
  start: civilDate('2027-03-06'),
  end: civilDate('2027-03-06'),
});

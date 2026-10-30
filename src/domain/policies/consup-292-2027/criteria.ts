import { frozenCriteria, parecerItems } from '../../reviews/parecer-items.ts';

export const criteria = frozenCriteria([
  ...parecerItems.map((criterion) => ({
    ...criterion,
    page: [
      'XII',
      'XIII',
      'XIV',
      'XV',
      'XVI',
      'XVII',
      'XVIII',
      'XIX',
      'XX',
      'XXI',
      'XXII',
      'XXIII',
      'XXIV',
      'XXV',
    ].includes(criterion.id)
      ? 4
      : 3,
    item:
      criterion.id === 'annual'
        ? 'Art. 4º'
        : criterion.id === 'semester'
          ? 'Art. 4º, § 1º'
          : criterion.id === 'window'
            ? 'Art. 8º'
            : criterion.item.replace('Art. 7º', 'Art. 11'),
    title:
      criterion.id === 'window'
        ? 'Janela do ano letivo: 01/02 a 17/12/2027; início até 15/02/2027'
        : criterion.id === 'XII'
          ? 'Plano de Ensino, PIT e RIT em cada semestre'
          : criterion.id === 'XXIV'
            ? 'Semana de Valorização de Mulheres que Fizeram História — segunda semana de março'
            : criterion.id === 'XXV'
              ? 'Semana da Ética e da Cidadania — primeira semana de maio'
              : criterion.title.replaceAll('2026', '2027'),
    pattern: criterion.id === 'XXV' ? 'etica|cidadania' : criterion.pattern,
  })),
  {
    id: 'XXVI',
    title:
      'Semana Cultural Interescolar em outubro: obrigatória nos técnicos e facultativa na graduação',
    page: 4,
    item: 'Art. 11, XXVI',
    pattern: 'cultural|interescolar',
  },
  {
    id: 'admission-regular',
    title:
      'Editais do Processo Seletivo 2028 até 15/06/2027; eventual ajuste pela Proens documentado',
    page: 3,
    item: 'Art. 10',
    pattern: 'processo seletivo',
  },
]);

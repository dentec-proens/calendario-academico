import type { EventEffect } from '#src/domain/calendar/model.ts';

// Mirrors counting/core.ts: exclusions block period dates, inclusions add dates inside periods.
export const countEffects: { value: EventEffect; title: string; description: string }[] = [
  {
    value: 'exclude',
    title: 'Retira da contagem',
    description: 'Nenhum dia da data conta como letivo, nem os que seriam de aula.',
  },
  {
    value: 'include',
    title: 'Acrescenta à contagem',
    description:
      'Todos os dias da data contam como letivos, inclusive sábados e outros dias sem aula, se estiverem em um período letivo.',
  },
  {
    value: 'note',
    title: 'Não altera a contagem',
    description: 'Cada dia conta ou não conforme a semana normal de aulas.',
  },
];

/** The same effects for a meeting on a teaching day (art. 5º): classes kept unless suspended. */
export const meetingEffects: typeof countEffects = [
  {
    value: 'note',
    title: 'Aulas mantidas',
    description: 'O dia segue a semana normal de aulas.',
  },
  {
    value: 'exclude',
    title: 'Aulas suspensas',
    description:
      'As aulas das ofertas da data são suspensas para a atividade; o dia deixa de contar.',
  },
];

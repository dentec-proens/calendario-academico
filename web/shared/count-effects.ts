import type { EventEffect } from '#src/domain/calendar/model.ts';

// Mirrors counting/core.ts: exclusions block period dates, inclusions add dates inside periods.
export const countEffects: { value: EventEffect; title: string; description: string }[] = [
  {
    value: 'exclude',
    title: 'Retira da contagem',
    description: 'Feriados e recessos. Dias que seriam de aula deixam de contar.',
  },
  {
    value: 'include',
    title: 'Acrescenta à contagem',
    description:
      'Sábados letivos e reposições. Dias sem aula passam a contar, se estiverem em um período letivo.',
  },
  {
    value: 'note',
    title: 'Não altera a contagem',
    description: 'Datas comemorativas e avisos. Cada dia segue a semana normal de aulas.',
  },
];

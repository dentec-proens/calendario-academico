/**
 * consup-292-2027-v7 (tightens) splits the art. 11, VII, deadline into two activities:
 * `withdrawal` keeps the course withdrawal and `component-cancellation` takes the component
 * cancellation. Frozen captures predate it: tests compare them through `withSplitWithdrawal`,
 * which renames the captured row and adds the new one right after it, as the rules expand.
 */
const captured = 'Prazo de trancamento de curso e cancelamento de matrícula em componente';
const titles = {
  withdrawal: 'Prazo de trancamento de curso',
  'component-cancellation': 'Prazo de cancelamento de matrícula em componente',
};

type Row = { id: string; name?: string; basis?: string; activity?: { activityId: string } };
type Coverage = { requirementId: string };

/** Captured 2027 rows with the split deadline; every other field is kept. */
export const withSplitWithdrawal = <T extends Row>(rows: readonly T[]): T[] =>
  rows.flatMap((row) => {
    if (!/^withdrawal(-\d+)?$/.test(row.id) || row.basis === 'Classificação legada') return [row];
    const rename = (id: 'withdrawal' | 'component-cancellation'): T => ({
      ...row,
      id: row.id.replace('withdrawal', id),
      ...(row.name ? { name: row.name.replace(captured, titles[id]) } : {}),
      ...(row.activity ? { activity: { ...row.activity, activityId: id } } : {}),
    });
    return [rename('withdrawal'), rename('component-cancellation')];
  });

/**
 * Captured coverage rows with the split deadline: the new row's coverage mirrors the old one,
 * offer by offer, after the last offer of the old row, as the plan evaluation lists them.
 */
export const withSplitCoverage = <T extends Coverage>(rows: readonly T[]): T[] =>
  rows.flatMap((row, index) => {
    if (!/^withdrawal-\d+$/.test(row.requirementId)) return [row];
    const last = rows.findLast((item) => item.requirementId === row.requirementId);
    if (last !== row) return [row];
    const clones = rows
      .slice(0, index + 1)
      .filter((item) => item.requirementId === row.requirementId)
      .map((item) => ({
        ...item,
        requirementId: item.requirementId.replace('withdrawal', 'component-cancellation'),
      }));
    return [row, ...clones];
  });

/** Captured readiness messages with the split deadline: a message naming the old row is repeated for the new one. */
export const withSplitReadiness = (messages: readonly string[]): string[] =>
  messages.flatMap((message) =>
    /\[withdrawal-\d+\]/.test(message)
      ? [message, message.replace(/\[withdrawal-(\d+)\]/, '[component-cancellation-$1]')]
      : [message],
  );

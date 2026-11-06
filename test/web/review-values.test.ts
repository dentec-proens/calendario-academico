import { expect, test } from 'vitest';
import { initialDraft, type ReviewSupport } from '../../web/features/reviews/review-values.ts';

const opened = (status: string, entries: object[], rulesetVersion = 'consup-292-2027-v9') =>
  ({
    status,
    rulesetVersion,
    sameYear: true,
    source: { norm: 'Norma' },
    calendar: { year: 2027 },
    initialConclusion: 'Inicial',
    criteria: ['a', 'b', 'c'].map((id) => ({
      id,
      initial: { id, status: 'PENDENTE', notes: '', reviewed: false, finding: '' },
    })),
    review: { rulesetVersion: 'consup-292-2027-v8', conclusion: 'Salva', entries },
  }) as unknown as ReviewSupport;

const saved = [
  { id: 'a', status: 'ATENDIDO', reviewed: true, notes: 'Decisão' },
  { id: 'b', status: 'ATENDIDO', reviewed: false, notes: 'Mantida' },
];
const entry = (draft: ReturnType<typeof initialDraft>, id: string) =>
  draft.entries.find((item) => item.id === id);

test('reopening keeps a decision and sends a saved suggestion back to the reviewer', () => {
  const draft = initialDraft(opened('em_revisao', saved));
  expect(entry(draft, 'a')).toMatchObject({ status: 'ATENDIDO', reviewed: true, notes: 'Decisão' });
  expect(entry(draft, 'b')).toMatchObject({
    status: 'PENDENTE',
    reviewed: false,
    notes: 'Mantida',
  });
  expect(entry(draft, 'c')).toMatchObject({ status: 'PENDENTE', reviewed: false, notes: '' });
  expect(draft.dirty).toBe(false);
});

test('consulting a closed parecer shows what was saved, without calling it an assessment', () => {
  const draft = initialDraft(opened('revisado', saved));
  expect(entry(draft, 'b')).toMatchObject({ status: 'ATENDIDO', reviewed: false });
});

test('a wording version keeps the assessments, and a tightened rule asks for them again', () => {
  expect(entry(initialDraft(opened('em_revisao', saved)), 'a')?.reviewed).toBe(true);
  const reopened = initialDraft({
    ...opened('em_revisao', saved),
    review: { rulesetVersion: 'consup-292-2027-v1', conclusion: 'Salva', entries: saved },
  } as unknown as ReviewSupport);
  expect(entry(reopened, 'a')).toMatchObject({ status: 'PENDENTE', reviewed: false });
  expect(entry(reopened, 'a')?.notes).toContain('Contexto da revisão anterior');
});

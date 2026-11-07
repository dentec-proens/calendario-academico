import { describe, expect, test } from 'vitest';
import { editorUrl, parseEditorPath } from '../../src/app/routes.ts';
import {
  continueLabel,
  editorNavigation,
  editorPages,
  editorSteps,
  stepIssueCounts,
} from '../../web/features/calendar-editor/editor-steps.ts';

describe('calendar wizard metadata', () => {
  test('each page has a single title and destination shared by the ordered steps', () => {
    expect(editorSteps.map((step) => step.section)).toEqual([
      'edit',
      'periods',
      'days',
      'vacations',
      'events',
      'issues',
    ]);
    expect(new Set(editorSteps.map((step) => step.section)).size).toBe(editorSteps.length);
    expect(editorPages.edit.title).toBe('Semana letiva');
    expect(editorPages.edit.path).toBe('/calendarios/$calendarId/editar');
    for (const page of Object.values(editorPages)) {
      const destination = page.path.replace('$calendarId', 'calendar-a');
      expect(destination).toBe(editorUrl('calendar-a', page.section));
      expect(parseEditorPath(destination)).toEqual({ id: 'calendar-a', section: page.section });
    }
    for (const step of editorSteps) expect(step).toBe(editorPages[step.section]);
  });

  test('previous and next actions traverse every step without wrapping at either end', () => {
    for (const [index, step] of editorSteps.entries()) {
      const navigation = editorNavigation(step.section);
      expect(navigation.current).toBe(step);
      expect(navigation.active).toBe(step);
      expect(navigation.stepIndex).toBe(index);
      expect(navigation.previous).toBe(index > 0 ? editorSteps.at(index - 1) : undefined);
      expect(navigation.next).toBe(editorSteps.at(index + 1));
    }
    expect(editorNavigation('assessments')).toEqual(editorNavigation('periods'));
    expect(editorNavigation('history')).toEqual(editorNavigation('events'));
    expect(editorNavigation('calendar')).toEqual({
      current: editorPages.calendar,
      active: undefined,
      stepIndex: -1,
      previous: undefined,
      next: undefined,
    });
  });

  test('continuation labels always use the complete destination title', () => {
    expect(continueLabel({ ...editorPages.periods, title: 'Novo título do passo' })).toBe(
      'Continuar para novo título do passo',
    );
    expect(editorSteps.map(continueLabel)).toEqual([
      'Continuar para semana letiva',
      'Continuar para organização por oferta',
      'Continuar para sábados letivos',
      'Continuar para férias',
      'Continuar para atividades',
      'Continuar para conferir e enviar',
    ]);
  });
});

test('each issue counts for the step that corrects it, as its review row leads there', () => {
  const activity = { kind: 'row', id: 'x' };
  expect(
    stepIssueCounts([
      { target: { area: 'organization' } },
      { target: { area: 'scope' } },
      { target: { area: 'date', eventId: 'a', name: 'A' } },
      { target: { area: 'observance', key: 'k' } },
      { target: undefined },
      { target: { area: 'activity', activity: activity as never } },
    ]),
  ).toEqual({ periods: 1, events: 3 });
});

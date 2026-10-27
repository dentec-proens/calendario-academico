import { describe, expect, test } from 'vitest';
import { editorUrl, parseEditorPath } from '../src/app-routes.ts';
import {
  continueLabel,
  editorNavigation,
  editorPages,
  editorSteps,
} from '../web/features/calendar-editor/editor-steps.ts';

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
    expect(continueLabel({ ...editorPages.periods, title: 'Novo título da etapa' })).toBe(
      'Continuar para novo título da etapa',
    );
    expect(editorSteps.map(continueLabel)).toEqual([
      'Continuar para semana letiva',
      'Continuar para períodos e avaliações',
      'Continuar para sábados letivos',
      'Continuar para férias docentes',
      'Continuar para atividades e datas do campus',
      'Continuar para revisão e conclusão',
    ]);
  });
});

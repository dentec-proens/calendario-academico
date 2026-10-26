import { describe, expect, it } from 'vitest';
import { FormDrafts } from '../web/shared/forms/drafts.tsx';

describe('form draft lifecycle', () => {
  it('copies values and field metadata without sharing editable references', () => {
    const drafts = new FormDrafts('user-a');
    const state = { values: { name: 'Unidade' }, fieldMetaBase: { name: { isDirty: true } } };
    drafts.write('campus:new', state);
    state.values.name = 'Alterado fora do formulário';
    const restored = drafts.read('campus:new', state);
    expect(restored.values.name).toBe('Unidade');
    expect(restored.fieldMetaBase.name.isDirty).toBe(true);
    restored.values.name = 'Outra cópia';
    expect(drafts.read('campus:new', state).values.name).toBe('Unidade');
    expect(new FormDrafts('user-b').read('campus:new', { name: '' })).toEqual({ name: '' });
  });

  it('keeps an operation pending across form mounts and settles only its identity', () => {
    const drafts = new FormDrafts('user-a');
    const observed: Array<[string, string | undefined]> = [];
    drafts.onCompleted((key, error) => observed.push([key, error]));
    drafts.write('campus:new', { name: 'Unidade' });
    const operation = drafts.begin('campus:new')!;
    expect(drafts.pending('campus:new')).toBe(true);
    expect(drafts.begin('campus:new')).toBeNull();
    drafts.finish('campus:new', Symbol('other'));
    expect(drafts.pending('campus:new')).toBe(true);
    drafts.finish('campus:new', operation);
    expect(drafts.pending('campus:new')).toBe(false);
    expect(drafts.read('campus:new', { name: '' })).toEqual({ name: '' });
    expect(observed).toEqual([['campus:new', undefined]]);
  });

  it('clears only drafts belonging to a discarded calendar session', () => {
    const drafts = new FormDrafts('user-a');
    drafts.write('calendar:a:period', { name: 'Bimestre' });
    drafts.write('calendar:a:event', { name: 'Evento' });
    drafts.write('calendar:b:event', { name: 'Outro calendário' });
    drafts.clearScope('calendar:a:');
    expect(drafts.read('calendar:a:period', { name: '' })).toEqual({ name: '' });
    expect(drafts.read('calendar:a:event', { name: '' })).toEqual({ name: '' });
    expect(drafts.read('calendar:b:event', { name: '' })).toEqual({ name: 'Outro calendário' });
  });

  it('retains the draft and exposes the failure to a remounted form for retry', () => {
    const drafts = new FormDrafts('user-a');
    const observed: string[] = [];
    drafts.onCompleted((_key, error) => {
      if (error) observed.push(error);
    });
    drafts.write('review:a', { notes: 'Evidência' });
    const operation = drafts.begin('review:a')!;
    drafts.finish('review:a', operation, 'Conflito de versão.');
    expect(drafts.read('review:a', { notes: '' })).toEqual({ notes: 'Evidência' });
    expect(observed).toEqual(['Conflito de versão.']);
    expect(drafts.begin('review:a')).not.toBeNull();
  });
});

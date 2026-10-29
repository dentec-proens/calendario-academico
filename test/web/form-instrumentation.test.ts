import { afterEach, expect, test } from 'vitest';
import { FormApi, formEventClient } from '@tanstack/react-form';
import { configureFormInstrumentation } from '../../web/app/form-instrumentation.ts';

afterEach(() => {
  globalThis.__TANSTACK_EVENT_TARGET__ = null;
  configureFormInstrumentation(false);
});

test('only opted-in safe forms reach the actual event bus, including on mount', () => {
  const target = new EventTarget();
  globalThis.__TANSTACK_EVENT_TARGET__ = target;
  const events: unknown[] = [];
  target.addEventListener('tanstack-connect', () =>
    target.dispatchEvent(new Event('tanstack-connect-success')),
  );
  target.addEventListener('tanstack-dispatch-event', (event) => {
    if (event instanceof CustomEvent) events.push(event.detail);
  });
  configureFormInstrumentation(true);
  const privateForm = new FormApi({
    formId: 'private:login',
    defaultValues: { password: 'private-value' },
  });
  const cleanupPrivate = privateForm.mount();
  const accidentalSecret = new FormApi({
    formId: 'inspect:account',
    defaultValues: { password: 'secret-value' },
  });
  const cleanupSecret = accidentalSecret.mount();
  const fileForm = new FormApi({
    formId: 'inspect:upload',
    defaultValues: { file: new Blob(['private-bytes']) },
  });
  const cleanupFile = fileForm.mount();
  expect(events).toEqual([]);
  const safeForm = new FormApi({
    formId: 'inspect:campus',
    defaultValues: { name: 'Campus de teste' },
  });
  const cleanupSafe = safeForm.mount();
  expect(events.length).toBeGreaterThan(0);
  expect(JSON.stringify(events)).toContain('Campus de teste');
  expect(JSON.stringify(events)).not.toContain('private-value');
  expect(JSON.stringify(events)).not.toContain('secret-value');
  cleanupPrivate();
  cleanupSecret();
  cleanupFile();
  cleanupSafe();
});

test('production configuration emits no form state', () => {
  const target = new EventTarget();
  globalThis.__TANSTACK_EVENT_TARGET__ = target;
  let eventCount = 0;
  target.addEventListener('tanstack-connect', () => {
    eventCount++;
  });
  configureFormInstrumentation(false);
  formEventClient.emit('form-unmounted', { id: 'inspect:campus' });
  expect(eventCount).toBe(0);
});

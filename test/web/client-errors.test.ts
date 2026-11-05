import { expect, test, vi } from 'vitest';
import { createClientErrorReporter, describeClientError } from '../../web/shared/client-errors.ts';

const reporter = (now = () => 0) => {
  const send = vi.fn(async (_report: unknown) => undefined);
  return {
    send,
    report: createClientErrorReporter({ send, route: () => '/x', release: 'r', now }),
  };
};

test('an application refusal keeps its message', () => {
  const error = { data: { error: 'Há versão mais recente.', status: 409 } };
  expect(describeClientError(error)).toEqual({ message: 'Há versão mais recente.', status: 409 });
});

test('an unknown error never carries its text, which can quote what was typed', () => {
  const error = new SyntaxError('Unexpected token in "CPF 123.456.789-00"');
  error.stack = 'SyntaxError: x\n    at parse (https://portal/assets/index-abc.js:10:20)';
  expect(describeClientError(error).message).toBe('SyntaxError em index-abc.js:10:20');
});

test('a validation refusal never carries its text, which can quote a typed name', () => {
  const error = { data: { error: 'A data de Festa da Maria não é letiva.', status: 400 } };
  expect(describeClientError(error)).toEqual({ message: 'Recusa do servidor', status: 400 });
});

test('text that looks like a location in the message is not taken for one', () => {
  const error = new SyntaxError('Unexpected token "cpf:12:34"');
  expect(error.stack).toContain('cpf:12:34');
  expect(describeClientError(error).message).not.toContain('cpf');
});

test('an expired session is not reported', () => {
  const { send, report } = reporter();
  report('save', Object.assign(new Error('Entre com sua conta.'), { status: 401 }));
  expect(send).not.toHaveBeenCalled();
});

test('the same failure is reported once a minute', () => {
  let time = 0;
  const { send, report } = reporter(() => time);
  const error = { data: { error: 'Recusado.', status: 409 } };
  report('save', error, 'calendar');
  report('save', error, 'calendar');
  expect(send).toHaveBeenCalledTimes(1);
  time = 60_000;
  report('save', error, 'calendar');
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0]![0]).toEqual({
    kind: 'save',
    status: 409,
    message: 'Recusado.',
    route: '/x',
    release: 'r',
    calendarId: 'calendar',
  });
});

test('a report that fails is silent', async () => {
  const send = vi.fn(async () => {
    throw new Error('sem conexão');
  });
  createClientErrorReporter({ send, route: () => '/x', release: 'r' })('render', new Error('x'));
  await expect(send.mock.results[0]!.value).rejects.toThrow();
});

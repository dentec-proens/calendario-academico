import { afterEach, expect, test, vi } from 'vitest';
import {
  capturePrivateLinkToken,
  clearPrivateLinkToken,
  clearPrivateLinkWhenLeaving,
  readPrivateLinkToken,
} from '../../web/app/private-links.ts';

afterEach(clearPrivateLinkToken);

test('private token is removed before router construction and remains scoped to its flow', () => {
  const replaceState = vi.fn();
  capturePrivateLinkToken(
    { pathname: '/ativar-conta', hash: '#token=private-value', search: '' } as Location,
    { state: null, replaceState } as unknown as History,
  );
  expect(replaceState).toHaveBeenCalledWith(null, '', '/ativar-conta');
  expect(readPrivateLinkToken('/ativar-conta')).toBe('private-value');
  expect(readPrivateLinkToken('/recuperar-senha')).toBeNull();
  clearPrivateLinkWhenLeaving('/calendarios');
  expect(readPrivateLinkToken('/ativar-conta')).toBeNull();
});

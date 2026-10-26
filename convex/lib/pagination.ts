import { fail } from './shared';

export function pageBound(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 100)
    fail('Escolha páginas de até 100 registros.');
}

import { nativeApi } from '../native/client.ts';
import type { RequestBody, RequestMethod } from '../native/types.ts';

export function api<T = unknown>(
  path: string,
  method: RequestMethod = 'GET',
  body?: RequestBody,
): Promise<T> {
  return nativeApi<T>(path, method, body);
}

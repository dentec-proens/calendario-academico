import { nativeApi, nativeEnabled } from '../native/client.js';

export async function api(path, method = 'GET', body, options = {}) {
  if (nativeEnabled) return nativeApi(path, method, body);
  const response = await fetch(path, {
    ...options,
    method,
    headers:
      body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Dentec-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || 'Não foi possível concluir a solicitação.'), {
      status: response.status,
    });
  return data;
}

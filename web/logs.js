const $ = (id) => document.getElementById(id);
let next = 0;

async function load(reset = false) {
  try {
    if (reset) {
      next = 0;
      $('log-list').replaceChildren();
    }
    const data = await api('/api/logs?offset=' + next);
    for (const entry of data.entries) {
      const li = document.createElement('li'),
        box = document.createElement('div'),
        title = document.createElement('strong'),
        detail = document.createElement('small');
      title.textContent = entry.action + (entry.calendar ? ' — ' + entry.calendar : '');
      detail.textContent =
        new Date(entry.at).toLocaleString('pt-BR') +
        ' · ' +
        entry.actor +
        (entry.version ? ' · versão ' + entry.version : '');
      box.append(title, detail);
      li.append(box);
      $('log-list').append(li);
    }
    next = data.nextOffset;
    $('more-logs').hidden = next === null;
    $('log-message').textContent = $('log-list').children.length
      ? 'Histórico atualizado às ' + new Date().toLocaleTimeString('pt-BR') + '.'
      : 'Nenhuma operação registrada para este acesso.';
  } catch (e) {
    $('log-message').textContent = e.message;
  }
}

$('refresh-logs').onclick = () => load(true);
$('more-logs').onclick = () => load();
load();
import { api } from './portal/api.js';
import { nativeEnabled, subscribeNative } from './native/client.js';

if (nativeEnabled)
  subscribeNative(
    '/api/logs?offset=0',
    () => load(true),
    (error) => {
      $('log-message').textContent = error.message;
    },
  );

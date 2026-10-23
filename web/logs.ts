import { element } from './native/dom.ts';
import { audit, nativeError } from './native/client.ts';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '../convex/_generated/api.js';

type LogsData = FunctionReturnType<typeof api.native.logs>;

const list = element('log-list', HTMLElement);
const more = element('more-logs', HTMLButtonElement);
const message = element('log-message', HTMLElement);
let next: string | null = null;
let loading = false;

function render(data: LogsData, reset = false) {
  if (reset) list.replaceChildren();
  for (const entry of data.entries) {
    const li = document.createElement('li');
    const box = document.createElement('div');
    const title = document.createElement('strong');
    const detail = document.createElement('small');
    title.textContent = entry.action + (entry.calendar ? ' — ' + entry.calendar : '');
    detail.textContent =
      new Date(entry.at).toLocaleString('pt-BR') +
      ' · ' +
      entry.actor +
      (entry.version ? ' · versão ' + entry.version : '');
    box.append(title, detail);
    li.append(box);
    list.append(li);
  }
  next = data.isDone ? null : data.continueCursor;
  more.hidden = next === null;
  message.textContent = list.children.length
    ? 'Histórico atualizado às ' + new Date().toLocaleTimeString('pt-BR') + '.'
    : 'Nenhuma operação registrada para este acesso.';
}

async function load(reset = false) {
  if (loading) return;
  loading = true;
  more.disabled = true;
  try {
    render(await audit.page(reset ? null : next), reset);
  } catch (error) {
    message.textContent = nativeError(error).message;
  } finally {
    loading = false;
    more.disabled = false;
  }
}

element('refresh-logs', HTMLButtonElement).onclick = () => {
  void load(true);
};
more.onclick = () => {
  void load();
};
const stop = audit.subscribe(
  (data) => render(data, true),
  (error) => {
    message.textContent = error.message;
  },
);
window.addEventListener('pagehide', stop, { once: true });

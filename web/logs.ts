import { api } from './portal/api.ts';
import { element } from './native/dom.ts';
import { nativeError, subscribeNative } from './native/client.ts';

interface LogEntry {
  action: string;
  calendar?: string;
  at: string;
  actor: string;
  version?: number;
}
interface LogsData {
  entries: LogEntry[];
  nextOffset: number | null;
}

const list = element('log-list', HTMLElement);
const more = element('more-logs', HTMLButtonElement);
const message = element('log-message', HTMLElement);
let next: number | null = 0;

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
  next = data.nextOffset;
  more.hidden = next === null;
  message.textContent = list.children.length
    ? 'Histórico atualizado às ' + new Date().toLocaleTimeString('pt-BR') + '.'
    : 'Nenhuma operação registrada para este acesso.';
}

async function load(reset = false) {
  try {
    render(await api<LogsData>('/api/logs?offset=' + (reset ? 0 : (next ?? 0))), reset);
  } catch (error) {
    message.textContent = nativeError(error).message;
  }
}

element('refresh-logs', HTMLButtonElement).onclick = () => {
  void load(true);
};
more.onclick = () => {
  void load();
};
const stop = subscribeNative<LogsData>(
  '/api/logs?offset=0',
  (data) => render(data, true),
  (error) => {
    message.textContent = error.message;
  },
);
window.addEventListener('pagehide', stop, { once: true });

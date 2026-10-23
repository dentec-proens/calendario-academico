import { element } from './native/dom.ts';

const controlTags = {
  'open-history': 'button',
  'download-pdf-top': 'button',
  'make-definitive': 'button',
  load: 'button',
  file: 'input',
  save: 'button',
  'server-save': 'button',
  identity: 'form',
  campus: 'input',
  year: 'input',
  offer: 'select',
  regime: 'select',
  'second-semester-intake': 'select',
  'week-form': 'form',
  'week-evidence': 'input',
  'week-confirmed': 'input',
  'period-form': 'form',
  'period-name': 'input',
  'period-start': 'input',
  'period-days': 'input',
  'period-end': 'input',
  'period-submit': 'button',
  'cancel-period-edit': 'button',
  'recalculate-stages': 'button',
  'saturday-form': 'form',
  'saturday-month': 'select',
  'saturday-name': 'input',
  'saturday-evidence': 'input',
  'vacation-form': 'form',
  'vacation-first-start': 'input',
  'vacation-first-days': 'input',
  'vacation-first-end': 'input',
  'vacation-second-start': 'input',
  'vacation-second-days': 'input',
  'vacation-second-end': 'input',
  'vacation-third-start': 'input',
  'vacation-third-days': 'input',
  'vacation-third-end': 'input',
  'vacation-evidence': 'input',
  'new-event': 'button',
  'event-form': 'form',
  'event-requirement': 'select',
  'event-name': 'input',
  'event-category': 'select',
  'event-kind': 'select',
  'event-start': 'input',
  'event-end': 'input',
  'event-hours': 'input',
  'event-evidence': 'input',
  'event-confirmed': 'input',
  'history-form': 'form',
  'history-file': 'input',
  'history-notes': 'textarea',
  'history-submit': 'button',
  'show-existing-history': 'input',
  'download-pdf': 'button',
  print: 'button',
  'teacher-day-date': 'input',
  'apply-stage-suggestion': 'button',
} as const;

type ControlId = keyof typeof controlTags;
type EditorElement<K extends string> = K extends ControlId
  ? HTMLElementTagNameMap[(typeof controlTags)[K]]
  : HTMLElement;

export function editorElement<K extends string>(id: K): EditorElement<K> {
  const node = element(id, HTMLElement);
  if (id in controlTags && node.localName !== controlTags[id as ControlId]) {
    throw new Error('Tipo de elemento incompatível: ' + id);
  }
  return node as EditorElement<K>;
}

export function editorControl(id: string) {
  const node = element(id, HTMLElement);
  if (!(
    node instanceof HTMLInputElement ||
    node instanceof HTMLSelectElement ||
    node instanceof HTMLTextAreaElement
  )) {
    throw new Error('Campo obrigatório ausente: ' + id);
  }
  return node;
}

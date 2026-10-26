import { createElement as h, Fragment, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays } from 'lucide-react';
import { Notice } from '../../web/components/ui/Notice.tsx';

// Every tone and slot of the shared notice, as the application composes them.
const gallery = h(
  Fragment,
  null,
  h(Notice, { id: 'notice-info' }, 'Os PDFs gerados são identificados como teste.'),
  h(
    Notice,
    { id: 'notice-success', tone: 'success', title: 'Sábados adicionados', announce: 'polite' },
    'Dois sábados foram incluídos no calendário.',
  ),
  h(
    Notice,
    {
      id: 'notice-warning',
      tone: 'warning',
      as: 'section',
      title: 'Nenhum sábado pode ser selecionado ainda',
      titleAs: 'h2',
      titleProps: { id: 'notice-warning-title', tabIndex: -1 },
      'aria-labelledby': 'notice-warning-title',
      actions: h('button', { type: 'button', id: 'notice-action' }, 'Cadastrar períodos'),
    },
    h('p', null, 'Conclua esta etapa e volte para cá:'),
    h(
      'ol',
      null,
      h(
        'li',
        null,
        h('a', { href: '#periodos' }, 'Períodos letivos'),
        ' — cadastre o início e o término.',
      ),
    ),
  ),
  h(
    Notice,
    { id: 'notice-danger', tone: 'danger', announce: 'assertive' },
    'Este período se sobrepõe a outro. Ajuste as datas e tente novamente.',
  ),
  h(Notice, { id: 'notice-custom-icon', icon: CalendarDays }, 'Ícone escolhido pela tela.'),
  h(Notice, { id: 'notice-no-icon', icon: null }, 'Aviso sem ícone.'),
  h(Notice, { id: 'notice-hidden', hidden: true }, 'Aviso oculto.'),
  // Transient messages: the live wrapper stays mounted and the notice inside stays silent.
  h(
    'div',
    { id: 'notice-live', role: 'status', 'aria-live': 'polite' },
    h(
      Notice,
      { id: 'notice-in-live', tone: 'success', elevated: true, className: 'notice-position' },
      'Calendário salvo e confirmado.',
    ),
  ),
);

createRoot(document.getElementById('notice-gallery')!).render(h(StrictMode, null, gallery));

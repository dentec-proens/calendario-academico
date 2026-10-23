import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ConfirmationDialogHost from '../../web/components/ConfirmationDialog.tsx';
import { confirmAction, type DialogIntent } from '../../web/components/confirmation.ts';

const root = document.createElement('div');
document.body.append(root);
createRoot(root).render(createElement(StrictMode, null, createElement(ConfirmationDialogHost)));

const state = { calls: 0, result: null as boolean | null, fail: false };
let release: (() => void) | undefined;
const button = document.createElement('button');
button.id = 'trigger';
button.textContent = 'Mover calendário';
button.onclick = () => {
  state.result = null;
  void confirmAction({
    title: 'Mover calendário para a lixeira?',
    description: 'O calendário “2027 — Campus Curitiba” sairá das listas de trabalho e pareceres.',
    consequence: 'Seus dados e documentos serão preservados para restauração.',
    intent: 'danger',
    confirmLabel: 'Mover para a lixeira',
    pendingLabel: 'Movendo…',
    onConfirm: async () => {
      state.calls++;
      if (state.fail) throw new Error('Falha de conexão. Tente novamente.');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  }).then((result) => {
    state.result = result;
  });
};
document.body.prepend(button);

window.confirmationTest = {
  state,
  release: () => release?.(),
  open: (intent) => {
    void confirmAction({
      title: 'Confirmar operação?',
      description: 'Descrição da operação.',
      intent,
      confirmLabel: 'Executar operação',
    });
  },
  duplicate: () =>
    confirmAction({
      title: 'Pedido duplicado',
      description: 'Não deve substituir a decisão atual.',
      confirmLabel: 'Executar',
    }),
};

declare global {
  interface Window {
    confirmationTest: {
      state: typeof state;
      release: () => void;
      open: (intent: DialogIntent) => void;
      duplicate: () => Promise<boolean>;
    };
  }
}

import { navigateApp } from './routing.tsx';
import { accounts } from './native/client.ts';
import { element } from './native/dom.ts';
import { nativeError } from './native/client.ts';

const requestForm = element('request-form', HTMLFormElement);
const resetForm = element('reset-form', HTMLFormElement);
const message = element('message', HTMLElement);
const email = element('email', HTMLInputElement);
const password = element('password', HTMLInputElement);
const confirmation = element('confirmation', HTMLInputElement);
let token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) {
  await navigateApp(location.pathname, { replace: true });
  requestForm.hidden = true;
  resetForm.hidden = false;
  element('title', HTMLElement).textContent = 'Definir nova senha';
  element('help', HTMLElement).textContent = '';
} else {
  requestForm.hidden = true;
  accounts
    .passwordOptions()
    .then((options) => {
      if (options.emailEnabled) {
        requestForm.hidden = false;
        return;
      }
      element('help', HTMLElement).textContent =
        'Solicite um link à DENTEC/PROENS informando seu e-mail cadastrado. O envio é manual; o link vale por 24 horas. Esta página não envia a solicitação.';
      const link = document.createElement('a');
      link.href =
        'mailto:dentec.proens@ifpr.edu.br?subject=Recuperar%20senha%20do%20calend%C3%A1rio';
      link.textContent = 'Abrir meu e-mail para solicitar recuperação';
      requestForm.before(link);
    })
    .catch(() => {
      message.textContent =
        'Não foi possível verificar a recuperação. Contate dentec.proens@ifpr.edu.br.';
    });
}

async function submit(form: HTMLFormElement, operation: () => Promise<{ message: string }>) {
  const button = form.querySelector('button');
  if (!button) throw new Error('Formulário de recuperação incompleto.');
  button.disabled = true;
  message.textContent = 'Aguarde…';
  try {
    const data = await operation();
    message.textContent = data.message;
    return true;
  } catch (error) {
    message.textContent = nativeError(error).message;
    return false;
  } finally {
    button.disabled = false;
  }
}

requestForm.onsubmit = async (event) => {
  event.preventDefault();
  await submit(requestForm, () => accounts.requestPasswordRecovery(email.value));
};
resetForm.onsubmit = async (event) => {
  event.preventDefault();
  if (password.value !== confirmation.value) {
    message.textContent = 'As senhas precisam ser iguais.';
    return;
  }
  if (await submit(resetForm, () => accounts.resetPassword({ token, password: password.value }))) {
    token = null;
    password.value = '';
    confirmation.value = '';
    resetForm.hidden = true;
  }
};

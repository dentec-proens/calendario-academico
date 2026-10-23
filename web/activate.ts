import { api } from './portal/api.ts';
import { element } from './native/dom.ts';
import { nativeError } from './native/client.ts';

interface Invitation {
  name: string;
  email: string;
  role: string;
  campus: string | null;
  expiresAt: string;
}

const form = element('activation-form', HTMLFormElement);
const password = element('activation-password', HTMLInputElement);
const confirmation = element('activation-confirm', HTMLInputElement);
const button = element('activate-button', HTMLButtonElement);
const message = element('invite-message', HTMLElement);
// The secret stays in the URL fragment, never in request URLs or referrer headers.
const token = new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null, '', location.pathname);

try {
  const info = await api<Invitation>('/api/invitations/check', 'POST', { token });
  element('invite-info', HTMLElement).textContent =
    `Convite para ${info.name} · ${info.email} · ${info.role}${info.campus ? ' · ' + info.campus : ''}. Válido até ${new Date(info.expiresAt).toLocaleString('pt-BR')}.`;
  form.hidden = false;
} catch (error) {
  element('invite-info', HTMLElement).textContent = nativeError(error).message;
}

form.onsubmit = async (event) => {
  event.preventDefault();
  try {
    if (password.value !== confirmation.value) throw new Error('As senhas não coincidem.');
    button.disabled = true;
    await api('/api/invitations/accept', 'POST', {
      token,
      email: element('activation-email', HTMLInputElement).value,
      password: password.value,
    });
    form.reset();
    form.hidden = true;
    message.textContent =
      'Conta ativada. Volte ao login e entre com seu e-mail e a senha que acabou de criar.';
  } catch (error) {
    message.textContent = nativeError(error).message;
  } finally {
    button.disabled = false;
  }
};

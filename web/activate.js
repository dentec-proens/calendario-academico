const $ = (id) => document.getElementById(id);
// The secret stays in the URL fragment, never in request URLs or referrer headers.
const token = new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null, '', location.pathname);

async function api(path, body) {
  return request(path, 'POST', body);
}

try {
  const info = await api('/api/invitations/check', { token });
  $('invite-info').textContent =
    `Convite para ${info.name} · ${info.email} · ${info.role}${info.campus ? ' · ' + info.campus : ''}. Válido até ${new Date(info.expiresAt).toLocaleString('pt-BR')}.`;
  $('activation-form').hidden = false;
} catch (e) {
  $('invite-info').textContent = e.message;
}
$('activation-form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    if ($('activation-password').value !== $('activation-confirm').value)
      throw Error('As senhas não coincidem.');
    $('activate-button').disabled = true;
    await api('/api/invitations/accept', {
      token,
      email: $('activation-email').value,
      password: $('activation-password').value,
    });
    $('activation-form').reset();
    $('activation-form').hidden = true;
    $('invite-message').textContent =
      'Conta ativada. Volte ao login e entre com seu e-mail e a senha que acabou de criar.';
  } catch (error) {
    $('invite-message').textContent = error.message;
  } finally {
    $('activate-button').disabled = false;
  }
};
import { api as request } from './portal/api.js';

const $ = (id) => document.getElementById(id);
let token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) {
  history.replaceState(null, '', location.pathname);
  $('request-form').hidden = true;
  $('reset-form').hidden = false;
  $('title').textContent = 'Definir nova senha';
  $('help').textContent = 'Escolha uma nova senha para acessar o calendário.';
} else {
  $('request-form').hidden = true;
  api('/api/password/options')
    .then(async (options) => {
      if (options.emailEnabled) {
        $('request-form').hidden = false;
        return;
      }
      $('help').textContent =
        'Solicite à administração DENTEC/PROENS um link de redefinição. Informe seu e-mail cadastrado. O link será enviado manualmente e valerá por 24 horas. Nenhuma solicitação foi enviada por esta página.';
      const link = document.createElement('a');
      link.href =
        'mailto:dentec.proens@ifpr.edu.br?subject=Recuperar%20senha%20do%20calend%C3%A1rio';
      link.textContent = 'Abrir meu e-mail para solicitar recuperação';
      $('request-form').before(link);
    })
    .catch(() => {
      $('message').textContent =
        'Não foi possível verificar a recuperação. Contate dentec.proens@ifpr.edu.br.';
    });
}

async function submit(form, path, body) {
  const button = form.querySelector('button');
  button.disabled = true;
  $('message').textContent = 'Aguarde…';
  try {
    const data = await api(path, 'POST', body);
    $('message').textContent = data.message;
    return true;
  } catch (e) {
    $('message').textContent = e.message;
    return false;
  } finally {
    button.disabled = false;
  }
}

$('request-form').onsubmit = async (e) => {
  e.preventDefault();
  await submit(e.target, '/api/password/request', { email: $('email').value });
};
$('reset-form').onsubmit = async (e) => {
  e.preventDefault();
  if ($('password').value !== $('confirmation').value) {
    $('message').textContent = 'As senhas precisam ser iguais.';
    return;
  }
  if (await submit(e.target, '/api/password/reset', { token, password: $('password').value })) {
    token = null;
    $('password').value = '';
    $('confirmation').value = '';
    $('reset-form').hidden = true;
  }
};
import { api } from './portal/api.js';

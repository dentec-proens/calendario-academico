import { LogIn, ShieldCheck } from 'lucide-react';
import { api } from './api.js';
import { useAction } from './useAction.js';

export default function AuthPanel({ status, onLogin, notify }) {
  const { pending, run } = useAction(notify);
  const setup = status.setupRequired;
  const help = setup
    ? status.hosted
      ? 'Crie a primeira conta ADMIN com o e-mail autorizado e o código privado de instalação que você salvou na Vercel. Escolha uma senha exclusiva para este sistema.'
      : 'Crie sua conta ADMIN local. Copie o código exibido no terminal que iniciou o aplicativo. Não use a senha da sua conta institucional.'
    : status.hosted
      ? 'Use o e-mail institucional e a senha cadastrada neste sistema.'
      : 'Use a conta cadastrada pela administração. Nesta instalação, a senha é local e não corresponde ao login institucional do IFPR.';

  function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    run(async () => {
      const credentials = { email: fields.get('email'), password: fields.get('password') };
      if (setup)
        await api('/api/setup', 'POST', {
          ...credentials,
          name: fields.get('name'),
          code: fields.get('code'),
        });
      await api('/api/login', 'POST', credentials);
      form.reset();
      await onLogin();
      notify('Acesso realizado.');
    });
  }

  return (
    <section id="auth" className="auth panel" aria-busy={pending}>
      <p className="eyebrow">ACESSO AO SISTEMA</p>
      <h1 id="auth-title">{setup ? 'Criar administração' : 'Entrar'}</h1>
      <p id="auth-help">{help}</p>
      {!setup && status.googleEnabled ? (
        <button
          type="button"
          id="google-login"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const data = await api('/api/google/start', 'POST', {});
              window.location.assign(data.url);
            })
          }
        >
          <LogIn aria-hidden="true" size={18} />
          Entrar com Google institucional
        </button>
      ) : null}
      {status.googleEnabled ? (
        <p id="google-help" className="help">
          Use sua conta Google @ifpr.edu.br previamente cadastrada pelo ADMIN.
        </p>
      ) : null}
      <form id="auth-form" onSubmit={submit}>
        <fieldset className="form-fields" disabled={pending}>
          {setup ? (
            <div id="setup-fields">
              <label>
                Nome do administrador
                <input id="admin-name" name="name" maxLength={120} required />
              </label>
              <label>
                Código de instalação
                <input id="setup-code" name="code" autoComplete="off" required />
              </label>
            </div>
          ) : null}
          <label>
            E-mail institucional
            <input id="email" name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            Senha local
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={setup ? 'new-password' : 'current-password'}
            />
          </label>
          <button id="auth-submit">
            {setup ? (
              <ShieldCheck aria-hidden="true" size={18} />
            ) : (
              <LogIn aria-hidden="true" size={18} />
            )}{' '}
            {pending ? 'Aguarde…' : setup ? 'Criar conta ADMIN' : 'Entrar'}
          </button>
        </fieldset>
      </form>
      <p>
        <a href="/recuperar-senha">Recuperar senha</a>
      </p>
    </section>
  );
}

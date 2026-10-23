import type { FormEvent } from 'react';
import type { Notify, Status } from '../native/types.ts';
import { LogIn, ShieldCheck } from 'lucide-react';
import { accounts } from '../native/client.ts';
import { useAction } from './useAction.ts';

export default function AuthPanel({ status, notify }: { status: Status; notify: Notify }) {
  const { pending, run } = useAction(notify);
  const setup = status.setupRequired;
  const help = setup
    ? 'Crie a primeira conta ADMIN com o e-mail autorizado e o código privado da implantação. Escolha uma senha exclusiva para este sistema.'
    : '';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const text = (name: string) => {
      const value = fields.get(name);
      return typeof value === 'string' ? value : '';
    };
    run(async () => {
      const credentials = {
        email: text('email'),
        password: text('password'),
      };
      if (setup)
        await accounts.setup({
          ...credentials,
          name: text('name'),
          code: text('code'),
        });
      await accounts.signIn(credentials);
      form.reset();
      notify('Acesso realizado.');
    });
  }

  return (
    <section id="auth" className="auth panel" aria-busy={pending}>
      <h1 id="auth-title">{setup ? 'Criar administração' : 'Entrar'}</h1>
      {setup ? <p id="auth-help">{help}</p> : null}
      {!setup && status.googleEnabled ? (
        <button
          type="button"
          id="google-login"
          disabled={pending}
          onClick={() =>
            run(async () => {
              await accounts.signInGoogle();
            })
          }
        >
          <LogIn aria-hidden="true" size={18} />
          Entrar com Google institucional
        </button>
      ) : null}
      {status.googleEnabled ? (
        <p id="google-help" className="help">
          Acesso restrito a contas @ifpr.edu.br autorizadas.
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
              minLength={10}
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

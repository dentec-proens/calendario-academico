import { TextField } from '../components/ui/Field.tsx';
import { Button } from '../components/ui/Button.tsx';
import type { FormEvent } from 'react';
import type { Notify, Status } from '../native/types.ts';
import { LogIn, ShieldCheck } from 'lucide-react';
import { accounts } from '../native/client.ts';
import { useAction } from './useAction.ts';
import { AppLink } from '../routing.tsx';

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
        <Button
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
        </Button>
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
              <TextField
                disabled={pending}
                label="Nome do administrador"
                id="admin-name"
                name="name"
                maxLength={120}
                required
              />
              <TextField
                disabled={pending}
                label="Código de instalação"
                id="setup-code"
                name="code"
                autoComplete="off"
                required
              />
            </div>
          ) : null}
          <TextField
            disabled={pending}
            label="E-mail institucional"
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
          />
          <TextField
            disabled={pending}
            label="Senha local"
            id="password"
            name="password"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete={setup ? 'new-password' : 'current-password'}
          />
          <Button type="submit" id="auth-submit">
            {setup ? (
              <ShieldCheck aria-hidden="true" size={18} />
            ) : (
              <LogIn aria-hidden="true" size={18} />
            )}{' '}
            {pending ? 'Aguarde…' : setup ? 'Criar conta ADMIN' : 'Entrar'}
          </Button>
        </fieldset>
      </form>
      <p>
        <AppLink href="/recuperar-senha">Recuperar senha</AppLink>
      </p>
    </section>
  );
}

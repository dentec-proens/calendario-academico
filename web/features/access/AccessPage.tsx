import { Link } from '@tanstack/react-router';
import { LogIn, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { TextField } from '../../components/ui/Field.tsx';
import { useSessionState } from '../../app/session.tsx';
import { useAccounts } from '../../shared/convex/accounts.ts';
import { useAction } from '../../shared/forms/useAction.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';

export default function AccessPage() {
  const { status, notify, isLoading, setArrivalPending } = useSessionState();
  const accounts = useAccounts();
  const google = useAction(notify, { kind: 'access', loss: false });
  const setup = status?.setupRequired === true;
  const {
    form,
    values,
    submit,
    pending: submitting,
    error,
  } = useDraftForm({
    defaultValues: { email: '', password: '', name: '', code: '' },
    onSubmit: async (value, { isCurrent }) => {
      const credentials = { email: value.email.trim(), password: value.password };
      if (setup)
        await accounts.setup({ ...credentials, name: value.name.trim(), code: value.code });
      await accounts.signIn(credentials);
      // The destination title announces the access; an earlier "session ended" no longer applies.
      // The redirect to the destination may unmount this form before sign-in resolves.
      notify('');
      setArrivalPending(true);
      if (!isCurrent()) return;
      form.reset();
    },
  });
  const pending = submitting || google.pending;
  if (isLoading || !status) return <p role="status">Carregando…</p>;
  return (
    <section id="auth" className="auth panel" aria-busy={pending}>
      <h1 id="auth-title">{setup ? 'Criar administração' : 'Entrar'}</h1>
      {setup ? (
        <p id="auth-help">
          Crie a primeira conta ADMIN com o e-mail autorizado e o código privado da implantação.
          Escolha uma senha exclusiva para este sistema.
        </p>
      ) : null}
      {!setup && status.googleEnabled ? (
        <Button
          type="button"
          id="google-login"
          disabled={pending}
          onClick={() => google.run(() => accounts.signInGoogle().then(() => undefined))}
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
                value={values.name}
                onValueChange={(value) => form.setFieldValue('name', value)}
              />
              <TextField
                disabled={pending}
                label="Código de instalação"
                id="setup-code"
                name="code"
                autoComplete="off"
                required
                value={values.code}
                onValueChange={(value) => form.setFieldValue('code', value)}
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
            value={values.email}
            onValueChange={(value) => form.setFieldValue('email', value)}
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
            value={values.password}
            onValueChange={(value) => form.setFieldValue('password', value)}
          />
          <Button type="submit" id="auth-submit">
            {setup ? (
              <ShieldCheck aria-hidden="true" size={18} />
            ) : (
              <LogIn aria-hidden="true" size={18} />
            )}
            {pending ? 'Aguarde…' : setup ? 'Criar conta ADMIN' : 'Entrar'}
          </Button>
        </fieldset>
        <FormFeedback error={error} />
      </form>
      <p>
        <Link to="/recuperar-senha">Recuperar senha</Link>
      </p>
    </section>
  );
}

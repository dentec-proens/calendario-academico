import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '../../components/ui/Button.tsx';
import { useAccounts } from '../../shared/convex/accounts.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import { clearPrivateLinkToken, readPrivateLinkToken } from '../../app/private-links.ts';

function RequestRecovery() {
  const accounts = useAccounts();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const { form, values, submit, pending, error } = useDraftForm({
    defaultValues: { email: '' },
    onSubmit: async (value, { isCurrent }) => {
      const result: { message: string } = await accounts.requestPasswordRecovery(value.email);
      if (!isCurrent()) return;
      form.reset();
      setMessage(result.message);
    },
  });
  useEffect(() => {
    let active = true;
    void accounts
      .passwordOptions()
      .then((options) => {
        if (active) setEnabled(options.emailEnabled);
      })
      .catch(() => {
        if (active) {
          setEnabled(false);
          setMessage(
            'Não foi possível verificar a recuperação. Contate dentec.proens@ifpr.edu.br.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [accounts]);
  return (
    <>
      <p id="help">
        {enabled === false
          ? 'Solicite um link à DENTEC/PROENS informando seu e-mail cadastrado. O envio é manual; o link vale por 24 horas. Esta página não envia a solicitação.'
          : 'Informe seu e-mail institucional para receber um link de redefinição de senha.'}
      </p>
      {enabled === null ? (
        <p role="status">Verificando recuperação…</p>
      ) : enabled ? (
        <form id="request-form" onSubmit={submit}>
          <label>
            E-mail institucional
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              maxLength={240}
              disabled={pending}
              value={values.email}
              onChange={(event) => form.setFieldValue('email', event.target.value)}
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? 'Aguarde…' : 'Enviar link de recuperação'}
          </Button>
          <FormFeedback error={error} />
        </form>
      ) : (
        <a href="mailto:dentec.proens@ifpr.edu.br?subject=Recuperar%20senha%20do%20calend%C3%A1rio">
          Abrir meu e-mail para solicitar recuperação
        </a>
      )}
      <p role="status">{message}</p>
    </>
  );
}

function ResetPassword({ token }: { token: string }) {
  const accounts = useAccounts();
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);
  const { form, values, submit, pending, error } = useDraftForm({
    defaultValues: { password: '', confirmation: '' },
    onSubmit: async (value, { isCurrent }) => {
      if (value.password !== value.confirmation) throw new Error('As senhas precisam ser iguais.');
      const result = await accounts.resetPassword({ token, password: value.password });
      clearPrivateLinkToken();
      if (!isCurrent()) return;
      form.reset();
      setMessage(result.message);
      setComplete(true);
    },
  });
  return (
    <>
      {!complete ? (
        <form id="reset-form" onSubmit={submit}>
          <fieldset disabled={pending}>
            <label>
              Nova senha do calendário
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={128}
                value={values.password}
                onChange={(event) => form.setFieldValue('password', event.target.value)}
              />
            </label>
            <label>
              Confirme a nova senha
              <input
                id="confirmation"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={128}
                value={values.confirmation}
                onChange={(event) => form.setFieldValue('confirmation', event.target.value)}
              />
            </label>
            <p>Use de 10 a 128 caracteres. Não precisa ser a senha do seu e-mail.</p>
            <Button type="submit">{pending ? 'Aguarde…' : 'Salvar nova senha'}</Button>
          </fieldset>
          <FormFeedback error={error} />
        </form>
      ) : null}
      <p role="status">{message}</p>
    </>
  );
}

export default function RecoverPage() {
  const [token] = useState(() => readPrivateLinkToken('/recuperar-senha'));
  return (
    <section className="auth panel">
      <h1 id="title">{token ? 'Definir nova senha' : 'Recuperar senha'}</h1>
      {token ? <ResetPassword token={token} /> : <RequestRecovery />}
      <p>
        <Link to="/">Voltar para entrar</Link>
      </p>
    </section>
  );
}

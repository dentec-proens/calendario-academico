import { useEffect, useState } from 'react';
import { BackLink } from '../../components/ui/BackLink.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { useAccounts } from '../../shared/convex/accounts.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import { clearPrivateLinkToken, readPrivateLinkToken } from '../../app/private-links.ts';

type Invitation = Awaited<ReturnType<ReturnType<typeof useAccounts>['checkInvitation']>>;
export default function ActivatePage() {
  const accounts = useAccounts();
  const [token] = useState(() => readPrivateLinkToken('/ativar-conta'));
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [message, setMessage] = useState('Verificando convite…');
  const [complete, setComplete] = useState(false);
  const { form, values, submit, pending, error } = useDraftForm({
    defaultValues: { email: '', password: '', confirmation: '' },
    onSubmit: async (value, { isCurrent }) => {
      if (value.password !== value.confirmation) throw new Error('As senhas não coincidem.');
      await accounts.acceptInvitation({ token, email: value.email, password: value.password });
      clearPrivateLinkToken();
      if (!isCurrent()) return;
      form.reset();
      setComplete(true);
      setMessage('Conta ativada. Entre com sua nova senha.');
    },
  });
  useEffect(() => {
    let active = true;
    void accounts
      .checkInvitation(token)
      .then((value) => {
        if (!active) return;
        setInvitation(value);
        setMessage('');
      })
      .catch((cause) => {
        if (active) setMessage(nativeError(cause).message);
      });
    return () => {
      active = false;
    };
    // Only the private link identity starts invitation validation.
  }, [token, accounts]);
  return (
    <section className="panel auth">
      <BackLink to="/">Entrar</BackLink>
      <h1>Criar minha senha</h1>
      <p id="invite-info">
        {invitation
          ? `Convite para ${invitation.name} · ${invitation.email} · ${invitation.role}${invitation.campus ? ' · ' + invitation.campus : ''}. Válido até ${new Date(invitation.expiresAt).toLocaleString('pt-BR')}.`
          : message}
      </p>
      <p id="invite-message" role="status">
        {invitation ? message : ''}
      </p>
      {invitation && !complete ? (
        <form id="activation-form" onSubmit={submit}>
          <fieldset disabled={pending}>
            <label>
              Confirme seu e-mail institucional
              <input
                id="activation-email"
                type="email"
                autoComplete="username"
                required
                value={values.email}
                onChange={(event) => form.setFieldValue('email', event.target.value)}
              />
            </label>
            <label>
              Crie uma senha para este sistema
              <input
                id="activation-password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
                value={values.password}
                onChange={(event) => form.setFieldValue('password', event.target.value)}
              />
            </label>
            <label>
              Repita a senha
              <input
                id="activation-confirm"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
                value={values.confirmation}
                onChange={(event) => form.setFieldValue('confirmation', event.target.value)}
              />
            </label>
            <p className="help">
              Use pelo menos 10 caracteres. Esta é a senha do Assistente de Calendário PROENS; não
              precisa ser a senha do seu e-mail.
            </p>
            <Button type="submit" id="activate-button">
              {pending ? 'Ativando…' : 'Criar senha e ativar conta'}
            </Button>
          </fieldset>
          <FormFeedback error={error} />
        </form>
      ) : null}
    </section>
  );
}

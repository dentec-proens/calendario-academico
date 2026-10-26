import { scrollIntoView } from '../../scroll.ts';
import { Button } from '../../components/ui/Button.tsx';
import type { Bootstrap, Notify } from '../../shared/convex/types.ts';
type Invitation = Awaited<ReturnType<ReturnType<typeof useAccounts>['issueInvitation']>>;
import { confirmAction } from '../../components/confirmation.ts';
import { useRef, useState } from 'react';
import { KeyRound, MailPlus, Trash2, UserPlus } from 'lucide-react';
import { useAccounts } from '../../shared/convex/accounts.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import PrivateLink from './PrivateLink.tsx';
import MemberRoleEditor from './MemberRoleEditor.tsx';
import { useAction } from '../../shared/forms/useAction.ts';
import CollectionPanel from '../../shared/forms/CollectionPanel.tsx';
import { useRouteForm } from '../../app/navigation.ts';

export default function AccountsPanel({
  info,
  googleEnabled,
  notify,
}: {
  info: Bootstrap;
  googleEnabled: boolean;
  notify: Notify;
}) {
  const [creating, setCreating] = useRouteForm('accounts');
  const accounts = useAccounts();
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [recovery, setRecovery] = useState<Awaited<
    ReturnType<typeof accounts.passwordRecovery>
  > | null>(null);
  const inviteRef = useRef<HTMLDivElement>(null);
  const recoveryRef = useRef<HTMLDivElement>(null);
  const actions = useAction(notify);
  const defaults: {
    role: Bootstrap['user']['role'];
    method: 'invite' | 'google' | 'local';
    campusId: string;
    name: string;
    email: string;
    password: string;
  } = {
    role: 'CAMPUS',
    method: 'invite',
    campusId: '',
    name: '',
    email: '',
    password: '',
  };
  const {
    form,
    values,
    submit,
    pending: submitting,
    error,
  } = useDraftForm({
    draftKey: `account:new:${info.user.id}`,
    excludeFromDraft: ['password'],
    defaultValues: defaults,
    onSubmit: async (value, { isCurrent }) => {
      const campus = info.campuses.find((item) => item.id === value.campusId) || info.campuses[0];
      if (value.role === 'CAMPUS' && !campus) throw new Error('Selecione o campus autorizado.');
      const created = await accounts.createMember({
        name: value.name.trim(),
        email: value.email.trim(),
        password: value.method === 'local' ? value.password : '',
        loginMethod: value.method,
        role: value.role,
        campusId: value.role === 'CAMPUS' && campus ? campus.id : null,
      });
      if (!isCurrent()) return;
      form.reset();
      setCreating(false);
      setInvite(null);
      setRecovery(null);
      if (created.inviteUrl) {
        showInvite({ inviteUrl: created.inviteUrl, inviteExpiresAt: created.inviteExpiresAt! });
        notify('Convite criado. A conta ficará pendente até a pessoa cadastrar sua senha.');
      } else
        notify(
          value.method === 'google'
            ? 'Acesso Google autorizado para o e-mail cadastrado. Nenhum e-mail foi enviado; o login depende da configuração Google pela TI.'
            : `Conta ${value.role} criada.`,
        );
    },
  });
  const { role, method, campusId } = values;
  const pending = submitting || actions.pending;
  const { run } = actions;
  const admin = role === 'ADMIN';

  function showInvite(created: Invitation) {
    setInvite(created);
    requestAnimationFrame(() => scrollIntoView(inviteRef.current, { behavior: 'smooth' }));
  }

  function removeMember(member: Bootstrap['users'][number]) {
    void confirmAction({
      title: 'Excluir acesso?',
      description: `O acesso de ${member.name} será excluído. Os convites e sessões serão cancelados.`,
      consequence: 'Calendários e pareceres serão preservados.',
      intent: 'danger',
      confirmLabel: 'Excluir acesso',
      pendingLabel: 'Excluindo…',
      onConfirm: async () => {
        await accounts.removeMember(member.id);
        setInvite(null);
        setRecovery(null);
        notify('Acesso excluído; histórico preservado.');
      },
    });
  }

  function recoverPassword(member: Bootstrap['users'][number]) {
    void confirmAction({
      title: 'Gerar link de recuperação?',
      description: `Será gerado um link de recuperação para ${member.email}. A senha só muda quando o titular concluir.`,
      consequence: 'Links de recuperação anteriores dessa conta deixarão de funcionar.',
      intent: 'primary',
      confirmLabel: 'Gerar link de recuperação',
      pendingLabel: 'Gerando link…',
      onConfirm: async () => {
        setRecovery(await accounts.passwordRecovery(member.id));
        requestAnimationFrame(() => scrollIntoView(recoveryRef.current, { behavior: 'smooth' }));
        notify('Link de recuperação gerado. Copie e envie pelo seu e-mail institucional.');
      },
    });
  }

  const localInvite =
    invite && ['127.0.0.1', 'localhost'].includes(new URL(invite.inviteUrl).hostname);

  return (
    <section id="accounts" className="page" aria-busy={pending}>
      <div ref={inviteRef}>
        {invite ? (
          <PrivateLink
            id="invite-result"
            title="Convite gerado"
            url={invite.inviteUrl}
            onClose={() => setInvite(null)}
            notify={notify}
          >
            <p id="invite-warning">
              {localInvite
                ? 'Este convite funciona somente neste computador. Para enviar aos campi, precisamos primeiro hospedar o sistema na internet. '
                : 'Envie este link somente à pessoa convidada. '}
              Validade: {new Date(invite.inviteExpiresAt).toLocaleString('pt-BR')}. O link permite
              criar a senha da conta e aparece somente nesta geração.
            </p>
          </PrivateLink>
        ) : null}
      </div>
      <div ref={recoveryRef}>
        {recovery ? (
          <PrivateLink
            id="recovery-result"
            title="Link de recuperação de senha"
            url={recovery.url}
            onClose={() => setRecovery(null)}
            notify={notify}
          >
            <p id="recovery-detail">
              Envie este link somente para {recovery.email}. Válido até{' '}
              {new Date(recovery.expiresAt).toLocaleString('pt-BR')}. Nenhum e-mail foi enviado
              automaticamente.
            </p>
          </PrivateLink>
        ) : null}
      </div>
      <CollectionPanel
        title="Contas e acessos"
        actionLabel="Nova conta"
        formTitle="Criar conta de acesso"
        formOpen={creating}
        onFormOpen={setCreating}
        busy={pending}
        form={
          <form id="user-form" onSubmit={submit}>
            <fieldset className="form-fields" disabled={pending}>
              <label>
                Forma de acesso
                <select
                  id="user-login-method"
                  value={method}
                  onChange={(e) =>
                    form.setFieldValue('method', e.target.value as 'invite' | 'google' | 'local')
                  }
                >
                  <option value="invite">Convite por link · A pessoa cria a senha</option>
                  <option value="local">Senha definida pelo ADMIN</option>
                  {googleEnabled ? (
                    <option value="google">Google institucional · sem criar senha local</option>
                  ) : null}
                </select>
              </label>
              {method === 'invite' ? (
                <p id="invite-account-help" className="help">
                  O sistema gera um link de uso único, válido por 48 horas. Envie somente à pessoa
                  convidada. Não há envio automático de e-mail.
                </p>
              ) : null}
              {method === 'google' ? (
                <p id="google-account-help" className="help">
                  Autorize um e-mail @ifpr.edu.br para entrar com Google. Nenhum convite será
                  enviado.
                </p>
              ) : null}
              <label>
                Perfil de acesso
                <select
                  id="user-role"
                  value={role}
                  onChange={(e) =>
                    form.setFieldValue('role', e.target.value as Bootstrap['user']['role'])
                  }
                >
                  <option value="CAMPUS">CAMPUS · Apenas sua unidade</option>
                  <option value="ADMIN">ADMIN · Acesso completo</option>
                  <option value="PARECERISTA">PARECERISTA · Revisões e pareceres</option>
                </select>
              </label>
              {admin ? (
                <p id="user-role-help" className="help">
                  Pode gerenciar todos os calendários, a base institucional e as contas.
                </p>
              ) : null}
              <div className="row-form">
                <label>
                  Nome do responsável
                  <input
                    id="user-name"
                    name="name"
                    value={values.name}
                    onChange={(event) => form.setFieldValue('name', event.target.value)}
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  E-mail institucional
                  <input
                    id="user-email"
                    name="email"
                    value={values.email}
                    onChange={(event) => form.setFieldValue('email', event.target.value)}
                    type="email"
                    required
                  />
                </label>
                {role === 'CAMPUS' ? (
                  <label id="user-campus-label">
                    Campus autorizado
                    <select
                      id="user-campus"
                      name="campusId"
                      required
                      value={
                        info.campuses.some((c) => c.id === campusId)
                          ? campusId
                          : info.campuses[0]?.id || ''
                      }
                      onChange={(e) => form.setFieldValue('campusId', e.target.value)}
                    >
                      {info.campuses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              {method === 'local' ? (
                <label id="user-password-label">
                  Senha local desta conta
                  <input
                    id="user-password"
                    name="password"
                    value={values.password}
                    onChange={(event) => form.setFieldValue('password', event.target.value)}
                    type="password"
                    minLength={10}
                    maxLength={128}
                    required
                    autoComplete="new-password"
                  />
                </label>
              ) : null}
              <Button type="submit" id="create-user-button">
                <UserPlus aria-hidden="true" size={18} />
                Criar conta {role}
              </Button>
            </fieldset>
            <FormFeedback error={error} />
          </form>
        }
      >
        <div className="account-list">
          <div className="account-list-heading" aria-hidden="true">
            <span>Conta</span>
            <span>Perfil de acesso</span>
            <span>Recuperação / convite</span>
            <span>Ações</span>
          </div>
          <ul id="user-list" className="records">
            {info.users.map((u) => (
              <li key={u.id}>
                <div className="account-identity">
                  <strong>{u.name}</strong>
                  <small>
                    {u.email} · {u.role} ·{' '}
                    {u.loginMethod === 'invite'
                      ? 'Convite pendente'
                      : u.loginMethod === 'google'
                        ? 'Google institucional'
                        : 'Senha local'}{' '}
                    · {info.campuses.find((c) => c.id === u.campusId)?.name || 'Institucional'}
                  </small>
                </div>
                <MemberRoleEditor key={u.id} member={u} campuses={info.campuses} notify={notify} />
                <div className="account-recovery">
                  {u.active && u.loginMethod !== 'google' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      data-password-recovery={u.id}
                      disabled={pending}
                      onClick={() => recoverPassword(u)}
                    >
                      <KeyRound aria-hidden="true" size={18} />
                      Gerar link de recuperação
                    </Button>
                  ) : null}
                  {u.loginMethod === 'invite' && !u.active ? (
                    <Button
                      type="button"
                      variant="secondary"
                      data-new-invite={u.id}
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const result = await accounts.issueInvitation(u.id);
                          showInvite(result);
                          notify('Novo convite gerado. O link anterior não funciona mais.');
                        })
                      }
                    >
                      <MailPlus aria-hidden="true" size={18} />
                      Gerar novo convite
                    </Button>
                  ) : null}
                </div>
                <div className="account-removal">
                  {u.id !== info.user.id ? (
                    <Button
                      type="button"
                      variant="danger"
                      data-remove-member={u.id}
                      disabled={pending}
                      onClick={() => removeMember(u)}
                    >
                      <Trash2 aria-hidden="true" size={18} />
                      Excluir acesso
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CollectionPanel>
    </section>
  );
}

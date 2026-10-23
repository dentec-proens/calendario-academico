import { Button } from '../components/ui/Button.tsx';
import { formText } from './form-values.ts';
import type { Bootstrap, Notify } from '../native/types.ts';
import type { FormEvent } from 'react';
import type { ReactNode } from 'react';
import type { Id } from '../../convex/_generated/dataModel.js';
type Invitation = Awaited<ReturnType<typeof accounts.issueInvitation>>;
import { confirmAction } from '../components/confirmation.ts';
import { useRef, useState } from 'react';
import { Copy, KeyRound, MailPlus, Trash2, UserPlus, X } from 'lucide-react';
import { accounts } from '../native/client.ts';
import { useAction } from './useAction.ts';
import CollectionPanel from './CollectionPanel.tsx';

function PrivateLink({
  id,
  title,
  children,
  url,
  onClose,
  notify,
}: {
  id: string;
  title: string;
  children: ReactNode;
  url: string;
  onClose: () => void;
  notify: Notify;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { pending, run } = useAction(notify);
  return (
    <div id={id} className="panel private-link">
      <h3>{title}</h3>
      {children}
      <label>
        Link privado
        <input
          id={id === 'invite-result' ? 'invite-url' : 'recovery-link'}
          ref={inputRef}
          value={url}
          readOnly
          autoComplete="off"
        />
      </label>
      <div className="actions">
        <Button
          type="button"
          id={id === 'invite-result' ? 'copy-invite' : 'copy-recovery'}
          disabled={pending}
          onClick={() =>
            run(async () => {
              try {
                await navigator.clipboard.writeText(url);
                notify('Link copiado.');
              } catch {
                inputRef.current?.select();
                notify('Selecione o link e use Ctrl+C.');
              }
            })
          }
        >
          <Copy aria-hidden="true" size={18} />
          Copiar link
        </Button>
        <Button
          type="button"
          variant="secondary"
          id={id === 'invite-result' ? 'close-invite' : 'close-recovery'}
          onClick={onClose}
        >
          <X aria-hidden="true" size={18} />
          Fechar
        </Button>
      </div>
    </div>
  );
}

export default function AccountsPanel({
  info,
  googleEnabled,
  notify,
}: {
  info: Bootstrap;
  googleEnabled: boolean;
  notify: Notify;
}) {
  const [creating, setCreating] = useState(false);
  const [role, setRole] = useState<Bootstrap['user']['role']>('CAMPUS');
  const [method, setMethod] = useState<'invite' | 'google' | 'local'>('invite');
  const [campusId, setCampusId] = useState('');
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [recovery, setRecovery] = useState<Awaited<
    ReturnType<typeof accounts.passwordRecovery>
  > | null>(null);
  const inviteRef = useRef<HTMLDivElement>(null);
  const recoveryRef = useRef<HTMLDivElement>(null);
  const { pending, run } = useAction(notify);
  const admin = role === 'ADMIN';

  function showInvite(created: Invitation) {
    setInvite(created);
    requestAnimationFrame(() => inviteRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }

  function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    run(async () => {
      const created = await accounts.createMember({
        name: formText(data, 'name'),
        email: formText(data, 'email'),
        password: method === 'local' ? formText(data, 'password') : '',
        loginMethod: method,
        role,
        campusId: role !== 'CAMPUS' ? null : (formText(data, 'campusId') as Id<'campuses'>),
      });
      form.reset();
      setCreating(false);
      setRole('CAMPUS');
      setMethod('invite');
      setCampusId('');
      setInvite(null);
      setRecovery(null);
      if (created.inviteUrl) {
        showInvite({ inviteUrl: created.inviteUrl, inviteExpiresAt: created.inviteExpiresAt! });
        notify('Convite criado. A conta ficará pendente até a pessoa cadastrar sua senha.');
      } else
        notify(
          method === 'google'
            ? 'Acesso Google autorizado para o e-mail cadastrado. Nenhum e-mail foi enviado; o login depende da configuração Google pela TI.'
            : admin
              ? 'Conta ADMIN criada para a equipe DENTEC/PROENS, com acesso a todos os campi.'
              : role === 'PARECERISTA'
                ? 'Conta PARECERISTA criada para análise e emissão de pareceres.'
                : 'Conta CAMPUS criada com acesso à unidade selecionada.',
        );
    });
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
        requestAnimationFrame(() => recoveryRef.current?.scrollIntoView({ behavior: 'smooth' }));
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
          <form id="user-form" onSubmit={createUser}>
            <fieldset className="form-fields" disabled={pending}>
              <label>
                Forma de acesso
                <select
                  id="user-login-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as 'invite' | 'google' | 'local')}
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
                  onChange={(e) => setRole(e.target.value as Bootstrap['user']['role'])}
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
                  <input id="user-name" name="name" required maxLength={120} />
                </label>
                <label>
                  E-mail institucional
                  <input id="user-email" name="email" type="email" required />
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
                      onChange={(e) => setCampusId(e.target.value)}
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
          </form>
        }
      >
        <ul id="user-list" className="records">
          {info.users.map((u) => (
            <li key={u.id}>
              <div>
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
              <div className="actions">
                <MemberRoleEditor
                  key={u.role + (u.campusId || '')}
                  member={u}
                  campuses={info.campuses}
                  notify={notify}
                />
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
            </li>
          ))}
        </ul>
      </CollectionPanel>
    </section>
  );
}

function MemberRoleEditor({
  member,
  campuses,
  notify,
}: {
  member: Bootstrap['users'][number];
  campuses: Bootstrap['campuses'];
  notify: Notify;
}) {
  const [role, setRole] = useState(member.role);
  const [campusId, setCampusId] = useState(member.campusId || '');
  const { pending, run } = useAction(notify);
  const changed = role !== member.role || (role === 'CAMPUS' && campusId !== member.campusId);
  return (
    <form
      className="row-form"
      onSubmit={(event) => {
        event.preventDefault();
        run(async () => {
          await accounts.updateMemberRole({
            id: member.id,
            role,
            campusId: role === 'CAMPUS' ? (campusId as Id<'campuses'>) : null,
          });
          notify('Perfil atualizado. O usuário deverá entrar novamente.');
        });
      }}
    >
      <label>
        Perfil de {member.name}
        <select
          value={role}
          disabled={pending}
          onChange={(event) => setRole(event.target.value as typeof role)}
        >
          <option value="ADMIN">Admin</option>
          <option value="PARECERISTA">Parecerista</option>
          <option value="CAMPUS">Campus</option>
        </select>
      </label>
      {role === 'CAMPUS' ? (
        <label>
          Campus de {member.name}
          <select
            value={campusId}
            required
            disabled={pending}
            onChange={(event) => setCampusId(event.target.value)}
          >
            <option value="">Selecione o campus</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button type="submit" disabled={pending || !changed}>
        Salvar perfil
      </Button>
    </form>
  );
}

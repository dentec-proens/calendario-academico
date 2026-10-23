import { confirmAction } from '../components/confirmation.ts';
import { useRef, useState } from 'react';
import { Copy, KeyRound, MailPlus, Trash2, UserPlus, X } from 'lucide-react';
import { accounts } from '../native/client.ts';
import { useAction } from './useAction.ts';
import CollectionPanel from './CollectionPanel.tsx';

function PrivateLink({ id, title, children, url, onClose, notify }) {
  const inputRef = useRef(null);
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
        <button
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
        </button>
        <button
          type="button"
          className="secondary"
          id={id === 'invite-result' ? 'close-invite' : 'close-recovery'}
          onClick={onClose}
        >
          <X aria-hidden="true" size={18} />
          Fechar
        </button>
      </div>
    </div>
  );
}

export default function AccountsPanel({ info, googleEnabled, notify }) {
  const [creating, setCreating] = useState(false);
  const [role, setRole] = useState('CAMPUS');
  const [method, setMethod] = useState('invite');
  const [campusId, setCampusId] = useState('');
  const [invite, setInvite] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const inviteRef = useRef(null);
  const recoveryRef = useRef(null);
  const { pending, run } = useAction(notify);
  const admin = role === 'ADMIN';

  function showInvite(created) {
    setInvite(created);
    requestAnimationFrame(() => inviteRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }

  function createUser(e) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    run(async () => {
      const created = await accounts.createMember({
        name: data.get('name'),
        email: data.get('email'),
        password: method === 'local' ? data.get('password') : '',
        loginMethod: method,
        role,
        campusId: admin ? null : data.get('campusId'),
      });
      form.reset();
      setCreating(false);
      setRole('CAMPUS');
      setMethod('invite');
      setCampusId('');
      setInvite(null);
      setRecovery(null);
      if (created.inviteUrl) {
        showInvite(created);
        notify('Convite criado. A conta ficará pendente até a pessoa cadastrar sua senha.');
      } else
        notify(
          method === 'google'
            ? 'Acesso Google autorizado para o e-mail cadastrado. Nenhum e-mail foi enviado; o login depende da configuração Google pela TI.'
            : admin
              ? 'Conta ADMIN criada para a equipe DENTEC/PROENS, com acesso a todos os campi.'
              : 'Conta CAMPUS criada com acesso à unidade selecionada.',
        );
    });
  }

  function removeMember(member) {
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

  function recoverPassword(member) {
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
                  onChange={(e) => setMethod(e.target.value)}
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
                <select id="user-role" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="CAMPUS">CAMPUS · Apenas sua unidade</option>
                  <option value="ADMIN">ADMIN · Equipe DENTEC/PROENS</option>
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
                {!admin ? (
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
              <button id="create-user-button">
                <UserPlus aria-hidden="true" size={18} />
                Criar conta {role}
              </button>
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
                {u.active && u.loginMethod !== 'google' ? (
                  <button
                    type="button"
                    data-password-recovery={u.id}
                    disabled={pending}
                    onClick={() => recoverPassword(u)}
                  >
                    <KeyRound aria-hidden="true" size={18} />
                    Gerar link de recuperação
                  </button>
                ) : null}
                {u.id !== info.user.id ? (
                  <button
                    type="button"
                    data-remove-member={u.id}
                    disabled={pending}
                    onClick={() => removeMember(u)}
                  >
                    <Trash2 aria-hidden="true" size={18} />
                    Excluir acesso
                  </button>
                ) : null}
                {u.loginMethod === 'invite' && !u.active ? (
                  <button
                    type="button"
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
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CollectionPanel>
    </section>
  );
}

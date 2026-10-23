import { useRef, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Copy,
  KeyRound,
  MailPlus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { api } from './api.ts';
import { useAction } from './useAction.ts';

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
                notify('Link copiado. Envie somente ao titular da conta.');
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
          Fechar e ocultar link
        </button>
      </div>
    </div>
  );
}

export default function AdministrationPanel({ info, googleEnabled, onCampus, notify }) {
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

  function createCampus(e) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    run(async () => {
      await api('/api/campuses', 'POST', { name: data.get('name') });
      form.reset();
      notify('Unidade cadastrada.');
    });
  }

  function createUser(e) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    run(async () => {
      const created = await api('/api/users', 'POST', {
        name: data.get('name'),
        email: data.get('email'),
        password: method === 'local' ? data.get('password') : '',
        loginMethod: method,
        role,
        campusId: admin ? null : data.get('campusId'),
      });
      form.reset();
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
    if (
      !window.confirm(
        `Excluir o acesso de ${member.name}? Os convites e sessões serão cancelados. Calendários e pareceres serão preservados.`,
      )
    )
      return;
    run(async () => {
      await api('/api/users/' + member.id, 'DELETE', {});
      setInvite(null);
      setRecovery(null);
      notify('Acesso excluído; histórico preservado.');
    });
  }

  function recoverPassword(member) {
    if (
      !window.confirm(
        `Gerar um link de recuperação para ${member.email}? Links de recuperação anteriores dessa conta deixarão de funcionar. A senha só muda quando o titular concluir.`,
      )
    )
      return;
    run(async () => {
      setRecovery(await api('/api/users/' + member.id + '/password-recovery', 'POST', {}));
      requestAnimationFrame(() => recoveryRef.current?.scrollIntoView({ behavior: 'smooth' }));
      notify('Link de recuperação gerado. Copie e envie pelo seu e-mail institucional.');
    });
  }

  const localInvite =
    invite && ['127.0.0.1', 'localhost'].includes(new URL(invite.inviteUrl).hostname);

  return (
    <section id="administration" className="page" aria-busy={pending}>
      <div className="panel">
        <h2>Todos os campi</h2>
        <ul id="campus-list" className="records">
          {info.campuses.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <small>
                  {info.calendars.filter((x) => x.campusId === c.id).length} calendário(s) ·{' '}
                  {info.users.filter((u) => u.campusId === c.id).length} conta(s)
                </small>
              </div>
              <button type="button" data-campus={c.id} onClick={() => onCampus(c.id)}>
                <CalendarDays aria-hidden="true" size={18} />
                Ver calendários
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel">
        <h2>Cadastrar unidade</h2>
        <p className="help">
          Foz do Iguaçu está incluído. Acrescente campi avançados ou centros de referência quando
          necessário.
        </p>
        <form id="campus-form" onSubmit={createCampus}>
          <fieldset className="row-form form-fields" disabled={pending}>
            <label>
              Nome da unidade
              <input id="campus-name" name="name" maxLength={120} required />
            </label>
            <button>
              <Building2 aria-hidden="true" size={18} />
              Cadastrar
            </button>
          </fieldset>
        </form>
      </div>
      <div className="panel">
        <h2>Criar conta de acesso</h2>
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
                Cadastre previamente o e-mail @ifpr.edu.br autorizado. O servidor usará sua conta
                Google institucional. Esta ação não envia convite por e-mail.
              </p>
            ) : null}
            <label>
              Perfil de acesso
              <select id="user-role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="CAMPUS">CAMPUS · Apenas sua unidade</option>
                <option value="ADMIN">ADMIN · Equipe DENTEC/PROENS</option>
              </select>
            </label>
            <p id="user-role-help" className="help">
              {admin
                ? 'Equipe DENTEC/PROENS: acesso a todos os calendários, à base institucional e à criação de contas.'
                : 'A conta terá acesso somente ao campus selecionado.'}
            </p>
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
                        const result = await api('/api/users/' + u.id + '/invitation', 'POST', {});
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
    </section>
  );
}

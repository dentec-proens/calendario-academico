import { Button } from '../../components/ui/Button.tsx';
import type { Bootstrap, Notify } from '../../shared/convex/types.ts';
import { useAccounts } from '../../shared/convex/accounts.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import { useEffect } from 'react';
import { Notice } from '../../components/ui/Notice.tsx';

export default function MemberRoleEditor({
  member,
  campuses,
  notify,
}: {
  member: Bootstrap['users'][number];
  campuses: Bootstrap['campuses'];
  notify: Notify;
}) {
  const accounts = useAccounts();
  const { form, values, dirty, submit, pending, error } = useDraftForm({
    draftKey: `account:role:${member.id}`,
    defaultValues: {
      role: member.role,
      campusId: member.campusId || '',
      expected: { role: member.role, campusId: member.campusId },
    },
    onSubmit: async (value, { isCurrent }) => {
      const campus = campuses.find((item) => item.id === value.campusId);
      if (value.role === 'CAMPUS' && !campus) throw new Error('Selecione o campus.');
      await accounts.updateMemberRole({
        id: member.id,
        role: value.role,
        campusId: value.role === 'CAMPUS' && campus ? campus.id : null,
        expected: value.expected,
      });
      if (!isCurrent()) return;
      form.reset({
        ...value,
        expected: {
          role: value.role,
          campusId: value.role === 'CAMPUS' && campus ? campus.id : null,
        },
      });
      notify('Perfil atualizado. O usuário deverá entrar novamente.');
    },
  });
  const { role, campusId } = values;
  const remoteChanged =
    values.expected.role !== member.role || values.expected.campusId !== member.campusId;
  useEffect(() => {
    if (!remoteChanged || dirty || pending) return;
    form.reset({
      role: member.role,
      campusId: member.campusId || '',
      expected: { role: member.role, campusId: member.campusId },
    });
  }, [dirty, form, member.campusId, member.role, pending, remoteChanged]);
  const changed =
    role !== values.expected.role || (role === 'CAMPUS' && campusId !== values.expected.campusId);
  return (
    <form className="member-role-editor" onSubmit={submit}>
      <label>
        <span className="member-role-label">Perfil de acesso</span>
        <select
          aria-label={`Perfil de ${member.name}`}
          value={role}
          disabled={pending}
          onChange={(event) => form.setFieldValue('role', event.target.value as typeof role)}
        >
          <option value="ADMIN">Admin</option>
          <option value="PARECERISTA">Parecerista</option>
          <option value="CAMPUS">Campus</option>
        </select>
      </label>
      {role === 'CAMPUS' ? (
        <label>
          Campus
          <select
            aria-label={`Campus de ${member.name}`}
            value={campusId}
            required
            disabled={pending}
            onChange={(event) => form.setFieldValue('campusId', event.target.value)}
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
      <Button
        type="submit"
        variant={changed ? 'primary' : 'secondary'}
        disabled={pending || !changed}
      >
        Salvar
      </Button>
      {remoteChanged && dirty ? (
        <Notice tone="warning" announce="polite">
          O perfil mudou em outra sessão. Suas alterações foram preservadas. Copie as informações
          necessárias e atualize a lista para conferir o acesso atual.
        </Notice>
      ) : null}
      <FormFeedback error={error} />
    </form>
  );
}

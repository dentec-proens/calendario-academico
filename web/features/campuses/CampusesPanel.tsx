import { Button } from '../../components/ui/Button.tsx';
import type { Bootstrap, Notify } from '../../shared/convex/types.ts';
import { Building2, CalendarDays } from 'lucide-react';
import { institution } from '../../shared/convex/institution.ts';
import CollectionPanel from '../../shared/forms/CollectionPanel.tsx';
import { useRouteForm } from '../../app/navigation.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';

export default function CampusesPanel({
  info,
  onCampus,
  notify,
}: {
  info: Bootstrap;
  onCampus: (id: string) => void;
  notify: Notify;
}) {
  const [creating, setCreating] = useRouteForm('campuses');
  const { form, submit, pending, error, clearDraft } = useDraftForm({
    draftKey: `campus:new:${info.user.id}`,
    defaultValues: { name: '' },
    onSubmit: async (value, { isCurrent }) => {
      const name = value.name.trim();
      if (!name) throw new Error('Informe o nome da unidade.');
      await institution.createCampus(name);
      if (!isCurrent()) return;
      form.reset();
      clearDraft();
      setCreating(false);
      notify('Unidade cadastrada.');
    },
  });

  return (
    <section id="campuses" className="page" aria-busy={pending}>
      <CollectionPanel
        title="Campi cadastrados"
        actionLabel="Cadastrar campus"
        formTitle="Cadastrar unidade"
        formOpen={creating}
        onFormOpen={setCreating}
        busy={pending}
        form={
          <form id="campus-form" onSubmit={submit}>
            <fieldset className="row-form form-fields" disabled={pending}>
              <form.Field
                name="name"
                validators={{
                  onBlur: ({ value }) => (!value.trim() ? 'Informe o nome da unidade.' : undefined),
                }}
              >
                {(field) => (
                  <label>
                    Nome da unidade
                    <input
                      id="campus-name"
                      name="name"
                      maxLength={120}
                      required
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0 || undefined}
                    />
                    {field.state.meta.errors.length ? (
                      <small role="alert">{field.state.meta.errors.join(', ')}</small>
                    ) : null}
                  </label>
                )}
              </form.Field>
              <Button type="submit">
                <Building2 aria-hidden="true" size={18} />
                Cadastrar
              </Button>
            </fieldset>
            <FormFeedback error={error} />
          </form>
        }
      >
        <ul id="campus-list" className="records">
          {info.campuses.map((campus) => (
            <li key={campus.id}>
              <div>
                <strong>{campus.name}</strong>
                <small>
                  {info.calendars.filter((calendar) => calendar.campusId === campus.id).length}{' '}
                  calendário(s) carregado(s) ·{' '}
                  {info.users.filter((user) => user.campusId === campus.id).length} conta(s)
                </small>
              </div>
              <Button type="button" data-campus={campus.id} onClick={() => onCampus(campus.id)}>
                <CalendarDays aria-hidden="true" size={18} />
                Ver calendários
              </Button>
            </li>
          ))}
        </ul>
      </CollectionPanel>
    </section>
  );
}

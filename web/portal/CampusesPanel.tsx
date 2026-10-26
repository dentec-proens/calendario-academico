import { Button } from '../components/ui/Button.tsx';
import { formText } from './form-values.ts';
import type { Bootstrap, Notify } from '../native/types.ts';
import type { FormEvent } from 'react';
import { Building2, CalendarDays } from 'lucide-react';
import { institution } from '../native/client.ts';
import { useAction } from './useAction.ts';
import CollectionPanel from './CollectionPanel.tsx';
import { useRouteForm } from './route-form.ts';

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
  const { pending, run } = useAction(notify);
  function createCampus(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    run(async () => {
      await institution.createCampus(formText(data, 'name'));
      form.reset();
      setCreating(false);
      notify('Unidade cadastrada.');
    });
  }

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
          <form id="campus-form" onSubmit={createCampus}>
            <fieldset className="row-form form-fields" disabled={pending}>
              <label>
                Nome da unidade
                <input id="campus-name" name="name" maxLength={120} required />
              </label>
              <Button type="submit">
                <Building2 aria-hidden="true" size={18} />
                Cadastrar
              </Button>
            </fieldset>
          </form>
        }
      >
        <ul id="campus-list" className="records">
          {info.campuses.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <small>
                  {info.calendars.filter((x) => x.campusId === c.id).length} calendário(s)
                  carregado(s) · {info.users.filter((u) => u.campusId === c.id).length} conta(s)
                </small>
              </div>
              <Button type="button" data-campus={c.id} onClick={() => onCampus(c.id)}>
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

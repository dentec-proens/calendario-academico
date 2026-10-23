import type { Bootstrap, Notify } from '../native/types.ts';
import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
import { categories } from '../../src/categories.ts';
import { modalityLabels, selectableModalities } from '../../src/modalities.ts';
import { institution } from '../native/client.ts';
import { useAction } from './useAction.ts';
import CollectionPanel from './CollectionPanel.tsx';

type CatalogueEvent = Bootstrap['catalogue']['events'][number];
const emptyEvent = (): CatalogueEvent => ({
  id: '',
  name: '',
  category: categories[0][0],
  kind: 'exclude',
  start: '',
  end: '',
  evidence: '',
  offers: ['integrado', 'subsequente', 'graduacao'],
  active: true,
});

export default function CataloguePanel({
  catalogue,
  canManage,
  notify,
}: {
  catalogue: Bootstrap['catalogue'];
  canManage: boolean;
  notify: Notify;
}) {
  const [creating, setCreating] = useState(false);
  const [event, setEvent] = useState(emptyEvent);
  const { pending, run } = useAction(notify);
  const nameRef = useRef<HTMLInputElement>(null);
  const change = <K extends keyof CatalogueEvent>(field: K, value: CatalogueEvent[K]) =>
    setEvent((previous) => ({ ...previous, [field]: value }));

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(async () => {
      await institution.saveCatalogue({
        ...event,
        id: event.id || undefined,
        revision: catalogue.revision,
      });
      setEvent(emptyEvent());
      setCreating(false);
      notify('Base atualizada. Os campi receberão a nova revisão ao abrir seus calendários.');
    });
  }

  function edit(item: CatalogueEvent) {
    setEvent({
      ...item,
      offers: selectableModalities.filter(
        (m) =>
          item.offers.includes(m) ||
          (['integrado', 'subsequente'].includes(m) && item.offers.includes('tecnico')),
      ),
    });
    setCreating(true);
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  return (
    <CollectionPanel
      title="Feriados e eventos institucionais"
      actionLabel={event.id ? 'Continuar edição do evento' : 'Novo evento institucional'}
      formTitle={event.id ? 'Editar evento institucional' : 'Novo evento institucional'}
      formOpen={creating}
      onFormOpen={setCreating}
      canCreate={canManage}
      busy={pending}
      form={
        <form id="catalogue-form" onSubmit={submit}>
          <fieldset className="form-fields" disabled={pending}>
            <input type="hidden" id="catalogue-id" value={event.id} />
            <div className="row-form">
              <label>
                Evento
                <input
                  id="catalogue-name"
                  ref={nameRef}
                  maxLength={160}
                  required
                  value={event.name}
                  onChange={(e) => change('name', e.target.value)}
                />
              </label>
              <label>
                Categoria
                <select
                  id="catalogue-category"
                  value={event.category}
                  onChange={(e) => change('category', e.target.value)}
                >
                  {categories.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Efeito
                <select
                  id="catalogue-kind"
                  value={event.kind}
                  onChange={(e) => change('kind', e.target.value as CatalogueEvent['kind'])}
                >
                  <option value="exclude">Excluir da contagem</option>
                  <option value="note">Sem efeito na contagem</option>
                  <option value="include">Incluir atividade letiva confirmada</option>
                </select>
              </label>
            </div>
            <div className="row-form">
              <label>
                Início
                <input
                  id="catalogue-start"
                  type="date"
                  required
                  value={event.start}
                  onChange={(e) => change('start', e.target.value)}
                />
              </label>
              <label>
                Término
                <input
                  id="catalogue-end"
                  type="date"
                  required
                  value={event.end}
                  onChange={(e) => change('end', e.target.value)}
                />
              </label>
              <label>
                Fonte e justificativa da alteração
                <input
                  id="catalogue-evidence"
                  maxLength={240}
                  required
                  value={event.evidence}
                  onChange={(e) => change('evidence', e.target.value)}
                />
              </label>
            </div>
            <fieldset>
              <legend>Ofertas abrangidas</legend>
              {selectableModalities.map((m) => (
                <label className="check" key={m}>
                  <input
                    type="checkbox"
                    name="catalogue-offer"
                    value={m}
                    checked={event.offers.includes(m)}
                    onChange={(e) =>
                      change(
                        'offers',
                        e.target.checked
                          ? [...event.offers, m]
                          : event.offers.filter((value) => value !== m),
                      )
                    }
                  />
                  {modalityLabels[m]}
                </label>
              ))}
            </fieldset>
            <label className="check">
              <input
                type="checkbox"
                id="catalogue-active"
                checked={event.active}
                onChange={(e) => change('active', e.target.checked)}
              />
              Registro ativo
            </label>
            <p className="help">Alterações válidas para todos os campi abrangidos.</p>
            <div className="actions">
              <button>
                <Save aria-hidden="true" size={18} />
                Salvar evento institucional
              </button>
              <button
                type="button"
                className="secondary"
                id="new-catalogue"
                onClick={() => setEvent(emptyEvent())}
              >
                <Plus aria-hidden="true" size={18} />
                Novo registro
              </button>
            </div>
          </fieldset>
        </form>
      }
    >
      <p id="catalogue-description">
        Versão {catalogue.revision} · {catalogue.events.filter((e) => e.active).length} registros
        ativos.
      </p>
      <ul id="catalogue-list" className="records">
        {[...catalogue.events]
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((item) => (
            <li key={item.id}>
              <div>
                <strong>
                  {item.name}
                  {!item.active ? ' · Inativo' : ''}
                </strong>
                <small>
                  {item.start} a {item.end} · {item.category} · {item.offers.join(', ')}
                </small>
                <small>{item.evidence}</small>
              </div>
              {canManage ? (
                <button
                  type="button"
                  className="link-button"
                  data-edit={item.id}
                  disabled={pending}
                  onClick={() => edit(item)}
                >
                  <Pencil aria-hidden="true" size={18} />
                  Editar
                </button>
              ) : null}
            </li>
          ))}
      </ul>
    </CollectionPanel>
  );
}

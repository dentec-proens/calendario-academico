import { scrollIntoView } from '../scroll.ts';
import { Button } from '../components/ui/Button.tsx';
import type { Bootstrap, Notify } from '../native/types.ts';
import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { categories } from '../../src/categories.ts';
import { modalityLabels, selectableModalities } from '../../src/modalities.ts';
import { institution } from '../native/client.ts';
import { useAction } from './useAction.ts';
import CollectionPanel from './CollectionPanel.tsx';
import { catalogueEventId, portalFormForPath, portalPaths } from '../../src/app-routes.ts';
import { getAppRouter, navigateApp, useAppLocation } from '../routing.tsx';

type CatalogueEvent = Bootstrap['catalogue']['events'][number];
const emptyEvent = (): CatalogueEvent => ({
  id: '',
  name: '',
  category: categories[0][0],
  kind: 'exclude',
  start: '',
  end: '',
  evidence: '',
  modalities: ['integrado', 'subsequente', 'graduacao'],
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
  const { pathname } = useAppLocation();
  const routeId = catalogueEventId(pathname);
  const creating =
    pathname.startsWith(portalPaths['institution-events']) && portalFormForPath(pathname);
  const [hasDraft, setHasDraft] = useState(false);
  const [event, setEvent] = useState(emptyEvent);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState(
    new Map<string, { event: CatalogueEvent; hasDraft: boolean }>(),
  );
  const missingEvent =
    routeId !== undefined && !catalogue.events.some((item) => item.id === routeId);
  if (creating && (routeId ?? '') !== draftKey) {
    if (draftKey !== null) setDrafts(new Map(drafts).set(draftKey, { event, hasDraft }));
    const key = routeId ?? '';
    const saved = drafts.get(key);
    const item = catalogue.events.find((item) => item.id === routeId);
    setDraftKey(key);
    setEvent(saved?.event ?? (item ? { ...item, modalities: [...item.modalities] } : emptyEvent()));
    setHasDraft(saved?.hasDraft ?? Boolean(item));
  }
  function setCreating(open: boolean) {
    const href = open
      ? event.id
        ? `${portalPaths['institution-events']}/${encodeURIComponent(event.id)}/editar`
        : `${portalPaths['institution-events']}/novo`
      : portalPaths['institution-events'];
    void navigateApp(href);
  }
  const { pending, run } = useAction(notify);
  const nameRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLParagraphElement>(null);
  const change = <K extends keyof CatalogueEvent>(field: K, value: CatalogueEvent[K]) => {
    setEvent((previous) => ({ ...previous, [field]: value }));
    setHasDraft(true);
  };

  async function closeForm() {
    const current = getAppRouter().latestLocation.pathname;
    if (current === pathname) await navigateApp(portalPaths['institution-events']);
    setDrafts((previous) => {
      const next = new Map(previous);
      if (draftKey !== null) next.delete(draftKey);
      return next;
    });
    setDraftKey(null);
    setEvent(emptyEvent());
    setHasDraft(false);
    requestAnimationFrame(() => {
      listRef.current?.focus({ preventScroll: true });
      scrollIntoView(listRef.current, { block: 'start' });
    });
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(async () => {
      await institution.saveCatalogue({
        ...event,
        id: event.id || undefined,
        revision: catalogue.revision,
      });
      await closeForm();
      notify('Base atualizada. Os campi receberão a nova revisão ao abrir seus calendários.');
    });
  }

  function edit(item: CatalogueEvent) {
    void navigateApp(`${portalPaths['institution-events']}/${encodeURIComponent(item.id)}/editar`);
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  return (
    <CollectionPanel
      title="Feriados e eventos institucionais"
      actionLabel={
        event.id
          ? 'Continuar edição do evento'
          : hasDraft
            ? 'Continuar cadastro do evento'
            : 'Novo evento institucional'
      }
      formTitle={event.id ? 'Editar evento institucional' : 'Novo evento institucional'}
      formOpen={creating && !missingEvent}
      onFormOpen={setCreating}
      canCreate={canManage}
      busy={pending}
      feedback={
        missingEvent ? <p role="status">Evento institucional não encontrado.</p> : undefined
      }
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
                    checked={event.modalities.includes(m)}
                    onChange={(e) =>
                      change(
                        'modalities',
                        e.target.checked
                          ? [...event.modalities, m]
                          : event.modalities.filter((value) => value !== m),
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
            <p className="help">
              Voltar à lista mantém este formulário. Cancelar {event.id ? 'edição' : 'cadastro'}{' '}
              descarta as alterações não salvas.
            </p>
            <div className="actions">
              <Button type="submit">
                <Save aria-hidden="true" size={18} />
                Salvar evento institucional
              </Button>
              <Button
                type="button"
                variant="secondary"
                id="cancel-catalogue"
                onClick={() => {
                  void closeForm();
                }}
              >
                <X aria-hidden="true" size={18} />
                Cancelar {event.id ? 'edição' : 'cadastro'}
              </Button>
            </div>
          </fieldset>
        </form>
      }
    >
      <p id="catalogue-description" ref={listRef} tabIndex={-1}>
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
                  {item.start} a {item.end} · {item.category} · {item.modalities.join(', ')}
                </small>
                <small>{item.evidence}</small>
              </div>
              {canManage ? (
                <Button
                  type="button"
                  variant="secondary"
                  data-edit={item.id}
                  disabled={pending}
                  onClick={() => edit(item)}
                >
                  <Pencil aria-hidden="true" size={18} />
                  Editar
                </Button>
              ) : null}
            </li>
          ))}
      </ul>
    </CollectionPanel>
  );
}

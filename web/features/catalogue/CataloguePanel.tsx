import { scrollIntoView } from '../../scroll.ts';
import { Button } from '../../components/ui/Button.tsx';
import type { Bootstrap, Notify } from '../../shared/convex/types.ts';
import { useEffect, useRef } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { categories } from '#src/domain/calendar/activities/categories.ts';
import { modalityLabels, selectableModalities } from '#src/domain/calendar/modalities.ts';
import { institution } from '../../shared/convex/institution.ts';
import CollectionPanel from '../../shared/forms/CollectionPanel.tsx';

import { useFeatureRoute } from '../../app/navigation.ts';
import { useNavigate } from '@tanstack/react-router';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import { Notice } from '../../components/ui/Notice.tsx';

type CatalogueEvent = Bootstrap['catalogue']['events'][number];
const emptyEvent = (revision: number): CatalogueEvent & { revision: number } => ({
  revision,
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
  const route = useFeatureRoute();
  const navigate = useNavigate();
  const routeId = route.eventId;
  const creating = route.creating;
  const missingEvent = Boolean(routeId && !catalogue.events.some((item) => item.id === routeId));
  const item = catalogue.events.find((entry) => entry.id === routeId);
  const {
    form,
    values: event,
    submit,
    pending,
    dirty,
    error,
    clearDraft,
  } = useDraftForm({
    draftKey: `catalogue:${routeId || 'new'}`,
    defaultValues: item
      ? { ...item, modalities: [...item.modalities], revision: catalogue.revision }
      : emptyEvent(catalogue.revision),
    onSubmit: async (value, { isCurrent }) => {
      if (!value.name.trim() || !value.evidence.trim())
        throw new Error('Informe o evento e sua fonte.');
      if (!value.modalities.length) throw new Error('Selecione ao menos uma oferta.');
      if (!value.start || !value.end || value.end < value.start)
        throw new Error('Confira o intervalo do evento.');
      await institution.saveCatalogue({
        ...value,
        id: value.id || undefined,
        revision: value.revision,
      });
      if (!isCurrent()) return;
      clearDraft();
      form.reset(emptyEvent(catalogue.revision));
      await navigate({ to: '/eventos-institucionais' });
      notify('Base atualizada. Os campi receberão a nova revisão ao abrir seus calendários.');
    },
  });
  const remoteChanged = event.revision !== catalogue.revision;
  useEffect(() => {
    if (!remoteChanged || dirty || pending) return;
    form.reset(
      item
        ? { ...item, modalities: [...item.modalities], revision: catalogue.revision }
        : emptyEvent(catalogue.revision),
    );
  }, [catalogue.revision, dirty, form, item, pending, remoteChanged]);
  const hasDraft = Boolean(event.name || event.evidence || event.start || event.end);
  const nameRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLParagraphElement>(null);
  function setCreating(open: boolean) {
    if (!open) void navigate({ to: '/eventos-institucionais' });
    else if (event.id)
      void navigate({
        to: '/eventos-institucionais/$eventId/editar',
        params: { eventId: event.id },
      });
    else void navigate({ to: '/eventos-institucionais/novo' });
  }
  async function closeForm() {
    clearDraft();
    form.reset(emptyEvent(catalogue.revision));
    await navigate({ to: '/eventos-institucionais' });
    requestAnimationFrame(() => {
      listRef.current?.focus({ preventScroll: true });
      scrollIntoView(listRef.current, { block: 'start' });
    });
  }
  function edit(entry: CatalogueEvent) {
    void navigate({ to: '/eventos-institucionais/$eventId/editar', params: { eventId: entry.id } });
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
                  onChange={(e) => form.setFieldValue('name', e.target.value)}
                />
              </label>
              <label>
                Categoria
                <select
                  id="catalogue-category"
                  value={event.category}
                  onChange={(e) => form.setFieldValue('category', e.target.value)}
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
                  onChange={(e) =>
                    form.setFieldValue('kind', e.target.value as CatalogueEvent['kind'])
                  }
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
                  onChange={(e) => form.setFieldValue('start', e.target.value)}
                />
              </label>
              <label>
                Término
                <input
                  id="catalogue-end"
                  type="date"
                  required
                  value={event.end}
                  onChange={(e) => form.setFieldValue('end', e.target.value)}
                />
              </label>
              <label>
                Fonte e justificativa da alteração
                <input
                  id="catalogue-evidence"
                  maxLength={240}
                  required
                  value={event.evidence}
                  onChange={(e) => form.setFieldValue('evidence', e.target.value)}
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
                      form.setFieldValue(
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
                onChange={(e) => form.setFieldValue('active', e.target.checked)}
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
          {remoteChanged && dirty ? (
            <Notice tone="warning" announce="polite">
              A base mudou em outra sessão. Suas alterações foram preservadas e não substituirão a
              versão atual. Copie os campos necessários, cancele a edição e abra o evento novamente
              para conferir os dados atualizados.
            </Notice>
          ) : null}
          <FormFeedback error={error} />
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

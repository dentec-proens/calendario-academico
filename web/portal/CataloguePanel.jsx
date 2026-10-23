import { useRef, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
import { categories } from '../../src/categories.mjs';
import { modalityLabels, selectableModalities } from '../../src/modalities.mjs';
import { api } from './api.ts';
import { useAction } from './useAction.ts';

const emptyEvent = () => ({
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

export default function CataloguePanel({ catalogue, isAdmin, notify }) {
  const [event, setEvent] = useState(emptyEvent);
  const { pending, run } = useAction(notify);
  const nameRef = useRef(null);
  const change = (field, value) => setEvent((previous) => ({ ...previous, [field]: value }));

  function submit(e) {
    e.preventDefault();
    run(async () => {
      await api('/api/catalogue', 'POST', {
        ...event,
        id: event.id || undefined,
        revision: catalogue.revision,
      });
      setEvent(emptyEvent());
      notify('Base atualizada. Os campi receberão a nova revisão ao abrir seus calendários.');
    });
  }

  function edit(item) {
    setEvent({
      ...item,
      offers: selectableModalities.filter(
        (m) =>
          item.offers.includes(m) ||
          (['integrado', 'subsequente'].includes(m) && item.offers.includes('tecnico')),
      ),
    });
    nameRef.current?.focus();
  }

  return (
    <div className="panel" aria-busy={pending}>
      <h2>Feriados e eventos institucionais</h2>
      <p id="catalogue-description">
        Versão {catalogue.revision} · {catalogue.events.filter((e) => e.active).length} registros
        ativos.{' '}
        {isAdmin
          ? 'Você administra esta base para todos os campi.'
          : 'Somente a DENTEC/PROENS pode alterar esta base.'}
      </p>
      <p className="help">
        As datas nacionais fixas de 2027 já estão cadastradas. Recessos e eventos de 2027 vêm da
        resolução SEI 4354987. Alterações centrais são incorporadas quando o calendário é aberto
        novamente; versões anteriores permanecem registradas.
      </p>
      {isAdmin ? (
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
                  onChange={(e) => change('kind', e.target.value)}
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
            <div className="actions">
              <button>
                <Save aria-hidden="true" size={18} />
                Salvar na base compartilhada
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
      ) : null}
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
              {isAdmin ? (
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
    </div>
  );
}

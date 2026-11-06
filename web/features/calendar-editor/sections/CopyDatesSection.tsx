import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { useId, useState } from 'react';
import type { Id } from '../../../../convex/_generated/dataModel.js';
import { compactRange } from '#src/domain/date-labels.ts';
import {
  applyCopiedDates,
  copyList,
  type CopyCandidate,
  type CopyGroup,
} from '#src/domain/calendar/commands/copy-dates.ts';
import { labelFor } from '#src/domain/calendar/offers.ts';
import { BackLink } from '../../../components/ui/BackLink.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { CategoryMark } from '../../../components/ui/CategoryMark.tsx';
import { LoadingIndicator } from '../../../components/ui/LoadingIndicator.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';
import { calendarRecordDates } from '../../../shared/convex/calendar-dates.ts';
import { functions } from '../../../shared/convex/client.ts';
import { countEffects } from '../../../shared/count-effects.ts';
import { copySourceLabel, useCopySources } from '../../calendars/copy-sources.ts';
import { editorPages } from '../editor-steps.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import './copy-dates.css';

const groups: { id: CopyGroup; title: string; hint: string }[] = [
  {
    id: 'shared',
    title: 'Datas de todas as ofertas da origem',
    hint: 'Provavelmente valem para o campus inteiro.',
  },
  {
    id: 'partial',
    title: 'Datas de parte das ofertas da origem',
    hint: 'Podem ser só daquela oferta.',
  },
  {
    id: 'activity',
    title: 'Datas de atividades e editais',
    hint: 'Uma data vinculada conta como atendimento da atividade neste calendário.',
  },
  { id: 'blocked', title: 'Não podem ser copiadas agora', hint: 'Cada linha diz o motivo.' },
];

const periodList = new Intl.ListFormat('pt-BR');
const datesLabel = (count: number) => (count === 1 ? '1 data' : `${count} datas`);

function CandidateRow({
  candidate,
  year,
  calendarId,
  checked,
  onToggle,
}: {
  candidate: CopyCandidate;
  year: number;
  calendarId: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const blocked = candidate.group === 'blocked';
  const notesId = useId();
  const hasNotes = Boolean(
    candidate.sourceOffers || candidate.activity || candidate.warning || candidate.blockedBy,
  );
  return (
    <li className="copy-date" data-copy-date={candidate.id} data-blocked={blocked ? '' : undefined}>
      <label className="copy-date-choice">
        <input
          type="checkbox"
          checked={checked}
          disabled={blocked}
          aria-describedby={hasNotes ? notesId : undefined}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="copy-date-when">
          {periodList.format(candidate.periods.map((period) => compactRange(period, year)))}
        </span>
        <span className="copy-date-name">
          <CategoryMark event={candidate} />
          {candidate.name}
        </span>
        <span className="copy-date-effect">
          {countEffects.find((effect) => effect.value === candidate.effect)?.title}
        </span>
      </label>
      {hasNotes ? (
        <div className="copy-date-notes" id={notesId}>
          {candidate.sourceOffers ? (
            <p>Na origem, só para {candidate.sourceOffers.join(', ')}.</p>
          ) : null}
          {candidate.activity ? (
            <p>
              Atividade: {candidate.activity.name}
              {candidate.activity.optional ? ' (opcional neste calendário)' : ''}.
            </p>
          ) : null}
          {candidate.warning ? <p className="copy-date-warning">{candidate.warning}</p> : null}
          {candidate.blockedBy ? (
            <p>
              {candidate.blockedBy}{' '}
              {candidate.needsPeriods ? (
                <Link to={editorPages.periods.path} params={{ calendarId }}>
                  Abrir Organização por oferta
                </Link>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** The dates of one source. What the person changed stays over the suggestion of each date. */
function CopyDatesList({ sourceId }: { sourceId: string }) {
  const { record, state, readOnly, applyWithUndo } = useCalendarEditor();
  const navigate = useNavigate();
  const wire = useQuery(functions.calendars.calendar, { id: sourceId as Id<'calendars'> });
  const source = wire ? calendarRecordDates(wire) : wire;
  const [changed, setChanged] = useState<Record<string, boolean>>({});
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const offers = state.offers.map((offer) => offer.id).filter((offer) => !excluded.includes(offer));
  const list = source ? copyList(state, source.state, offers) : null;
  if (!source || !list) return <LoadingIndicator label="Carregando datas…" />;
  const sourceState = source.state;
  const isChecked = (candidate: CopyCandidate) =>
    candidate.group !== 'blocked' && (changed[candidate.id] ?? candidate.suggested);
  const chosen = list.candidates.filter(isChecked).map((candidate) => candidate.id);
  const setChecked = (candidates: readonly CopyCandidate[], checked: boolean) =>
    setChanged((current) => ({
      ...current,
      ...Object.fromEntries(candidates.map((candidate) => [candidate.id, checked])),
    }));
  function apply() {
    const copied = applyWithUndo(
      (current) =>
        applyCopiedDates(current, sourceState, chosen, offers, () => crypto.randomUUID()),
      () => ({
        text: `${datesLabel(chosen.length)} ${chosen.length === 1 ? 'copiada' : 'copiadas'} para o calendário.`,
        undone: 'Cópia desfeita.',
      }),
    );
    if (copied)
      void navigate({
        to: editorPages.events.path,
        params: { calendarId: record.id },
        search: ({ origem: _origem, ...search }) => search,
      });
  }
  return (
    <>
      <div className="copy-dates-offers">
        {state.offers.length > 1 ? (
          <fieldset>
            <legend>As datas valerão para</legend>
            {state.offers.map((offer) => (
              <label className="check" key={offer.id}>
                <input
                  type="checkbox"
                  name="copy-offer"
                  value={offer.id}
                  checked={offers.includes(offer.id)}
                  // An empty choice has no list to show: the date needs an offer.
                  disabled={offers.length === 1 && offers[0] === offer.id}
                  onChange={(event) =>
                    setExcluded((current) =>
                      event.target.checked
                        ? current.filter((id) => id !== offer.id)
                        : [...current, offer.id],
                    )
                  }
                />
                {labelFor(state, offer.id)}
              </label>
            ))}
          </fieldset>
        ) : (
          <p>
            <strong>As datas valerão para</strong> {labelFor(state, state.offers[0].id)}
          </p>
        )}
      </div>
      <Notice id="copy-dates-help">
        Confira cada data antes de aplicar. Ela passa a valer neste calendário como uma data comum,
        que pode ser editada ou removida depois, e não acompanha mudanças feitas na origem.
        {list.alreadyPresent
          ? ` ${datesLabel(list.alreadyPresent)} da origem já ${list.alreadyPresent === 1 ? 'está' : 'estão'} neste calendário e não ${list.alreadyPresent === 1 ? 'aparece' : 'aparecem'} na lista.`
          : ''}
        {list.omitted
          ? ` ${datesLabel(list.omitted)} de etapas, resultados, conselhos e reuniões por etapa ${list.omitted === 1 ? 'fica' : 'ficam'} de fora, porque ${list.omitted === 1 ? 'depende' : 'dependem'} da organização da oferta.`
          : ''}
      </Notice>
      {!list.candidates.length ? (
        <Notice id="copy-dates-empty">Não há datas para copiar deste calendário.</Notice>
      ) : null}
      {groups.map((group) => {
        const candidates = list.candidates.filter((candidate) => candidate.group === group.id);
        if (!candidates.length) return null;
        const selectable = group.id !== 'blocked';
        const allChecked = selectable && candidates.every(isChecked);
        return (
          <section
            key={group.id}
            className="copy-dates-group"
            data-copy-group={group.id}
            aria-labelledby={`copy-group-${group.id}`}
          >
            <div className="copy-dates-group-heading">
              <div>
                <h3 id={`copy-group-${group.id}`}>{group.title}</h3>
                <p className="help">{group.hint}</p>
              </div>
              {selectable ? (
                <Button
                  variant="secondary"
                  aria-describedby={`copy-group-${group.id}`}
                  onClick={() => setChecked(candidates, !allChecked)}
                >
                  {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
                </Button>
              ) : null}
            </div>
            <ul>
              {candidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  year={state.year}
                  calendarId={record.id}
                  checked={isChecked(candidate)}
                  onToggle={(checked) => setChecked([candidate], checked)}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {list.candidates.length ? (
        <div className="copy-dates-actions">
          <span role="status">
            {chosen.length
              ? `${datesLabel(chosen.length)} ${chosen.length === 1 ? 'marcada' : 'marcadas'}`
              : 'Nenhuma data marcada'}
          </span>
          <div>
            <Link
              className="ui-button ui-button--secondary"
              to={editorPages.events.path}
              params={{ calendarId: record.id }}
              search={({ origem: _origem, ...search }) => search}
            >
              Cancelar
            </Link>
            <Button id="copy-dates-apply" disabled={readOnly || !chosen.length} onClick={apply}>
              {chosen.length ? `Aplicar ${datesLabel(chosen.length)}` : 'Aplicar'}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Copies dates of another calendar of the campus and year into this draft. */
export default function CopyDatesSection() {
  const { record, locked, role } = useCalendarEditor();
  const { origem } = useSearch({ strict: false });
  const navigate = useNavigate();
  const { sources, loading } = useCopySources(record.campusId);
  const options = sources.filter((item) => item.year === record.year && item.id !== record.id);
  // An address may name a calendar that is gone or out of reach: it simply is not offered.
  const source = options.find((item) => item.id === origem);
  // A pause for maintenance or sign-in keeps the screen and its marks: only Apply waits.
  return (
    <section id="copy-dates-page" className="view" aria-labelledby="editor-section-title">
      <BackLink
        to={editorPages.events.path}
        params={{ calendarId: record.id }}
        search={({ origem: _origem, ...search }) => search}
      >
        Voltar às atividades
      </BackLink>
      {locked || role === 'PARECERISTA' ? (
        <Notice tone="warning" id="copy-dates-locked">
          Este calendário não pode ser alterado agora, por isso não recebe datas copiadas.
        </Notice>
      ) : loading ? (
        <LoadingIndicator label="Carregando calendários…" />
      ) : !options.length ? (
        <Notice id="copy-dates-no-source">
          Não há outro calendário deste campus em {record.year} para copiar.
        </Notice>
      ) : (
        <>
          <div className="copy-dates-source">
            <label>
              Calendário de origem
              <select
                id="copy-dates-source"
                value={source?.id ?? ''}
                onChange={(event) =>
                  void navigate({
                    to: editorPages.copy.path,
                    params: { calendarId: record.id },
                    search: (previous) => ({
                      ...previous,
                      origem: event.target.value || undefined,
                    }),
                    replace: true,
                  })
                }
              >
                <option value="">Selecione</option>
                {options.map((item) => (
                  <option key={item.id} value={item.id}>
                    {copySourceLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {source ? <CopyDatesList key={source.id} sourceId={source.id} /> : null}
        </>
      )}
    </section>
  );
}

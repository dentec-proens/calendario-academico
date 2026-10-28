import { ChevronDown, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { modalityLabels } from '../../../src/modalities.ts';
import { periodsForModality } from '../../../src/calendar-rules/index.ts';
import { evaluateCalendar } from '../../../src/evaluation.ts';
import { useCalendarEditor } from './session/CalendarEditorProvider.tsx';
import './teaching-day-summary.css';

function referenceStatus(observed: number, expected: number | null) {
  if (expected === null) return 'Sem referência normativa configurada';
  const missing = expected - observed;
  return missing > 0
    ? `Falta${missing === 1 ? '' : 'm'} ${missing} dia${missing === 1 ? '' : 's'}`
    : observed === expected
      ? 'Referência atingida'
      : `${observed - expected} dia${observed - expected === 1 ? '' : 's'} acima da referência`;
}

export default function TeachingDaySummary() {
  const { state, evaluation, events, dirty, unapplied } = useCalendarEditor();
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (
        disclosure.current?.open &&
        event.target instanceof Node &&
        !disclosure.current.contains(event.target)
      ) {
        disclosure.current.open = false;
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
    };
  }, []);
  const offers = useMemo(
    () =>
      state.modalities.map((modality) => {
        const periods = periodsForModality(state, modality);
        let result = periods.length ? evaluation?.byModality[modality] : undefined;
        // An unfinished offer must not hide the count of offers already configured.
        if (!evaluation && state.weekConfirmed && periods.length) {
          try {
            result = evaluateCalendar({ ...state, modalities: [modality] }, events).byModality[
              modality
            ];
          } catch {
            // Show the configuration prompt until this offer can be evaluated.
          }
        }
        const annual = result?.checks.find((check) => check.scope === 'annual');
        const missing = result
          ? Math.max(0, ...result.checks.map((check) => (check.expected ?? 0) - check.observed))
          : Infinity;
        const tone = !annual || annual.expected === null ? 'neutral' : missing ? 'warning' : 'met';
        return { modality, periods, result, annual, missing, tone };
      }),
    [state, evaluation, events],
  );
  const close = () => {
    if (!disclosure.current) return;
    disclosure.current.open = false;
    disclosure.current.querySelector('summary')?.focus();
  };
  const tone = offers.some((offer) => offer.tone === 'warning')
    ? 'warning'
    : offers.every((offer) => offer.tone === 'met')
      ? 'met'
      : 'neutral';
  return (
    <details
      ref={disclosure}
      className="teaching-day-summary"
      data-tone={tone}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && disclosure.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <summary aria-label="Ver detalhes dos dias letivos">
        <span className="teaching-day-label">Dias letivos</span>
        <span className="teaching-day-offers" role="status" aria-live="polite" aria-atomic="true">
          {offers.map(({ modality, annual, missing, tone: offerTone }) => (
            <span className="teaching-day-current" key={modality} data-tone={offerTone}>
              <span className="teaching-day-offer">{modalityLabels[modality]}</span>
              {annual ? (
                <>
                  <strong>
                    {annual.observed}
                    {annual.expected !== null ? ` / ${annual.expected}` : ' dias'}
                  </strong>
                  {annual.expected !== null && (
                    <span className="teaching-day-status">
                      {annual.observed >= annual.expected && missing > 0
                        ? 'Confira os períodos'
                        : referenceStatus(annual.observed, annual.expected)}
                    </span>
                  )}
                  {annual.expected !== null && (
                    <span className="teaching-day-progress" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.min(100, (annual.observed / annual.expected) * 100)}%`,
                        }}
                      />
                    </span>
                  )}
                </>
              ) : (
                <span className="teaching-day-pending">A definir</span>
              )}
            </span>
          ))}
        </span>
        <span className="teaching-day-toggle">
          Detalhes
          <ChevronDown aria-hidden="true" />
        </span>
      </summary>
      <div
        className="teaching-day-details"
        role="region"
        aria-label="Dias letivos por oferta e período"
      >
        {unapplied || dirty ? (
          <p className="help teaching-day-unsaved">
            {unapplied ? 'Campos em preenchimento ainda não entram na contagem.' : ''}
            {dirty ? ' Há alterações aguardando confirmação de salvamento.' : ''}
          </p>
        ) : null}
        {offers.map(({ modality, periods, result, annual: offerAnnual }) => (
          <section
            key={modality}
            className="teaching-day-detail-offer"
            aria-label={modalityLabels[modality]}
          >
            <h3>{modalityLabels[modality]}</h3>
            {result && offerAnnual ? (
              <dl>
                {result.checks.map((check, index) => {
                  const period = periods[index - 1];
                  return (
                    <div
                      key={index === 0 ? 'annual-total' : `period:${period.id}`}
                      data-reference={check.status}
                    >
                      <dt>{index === 0 ? 'Total no ano' : period.name || period.id}</dt>
                      <dd>
                        <strong>
                          {check.observed}
                          {check.expected !== null ? ` / ${check.expected}` : ''} dias
                        </strong>
                        <span>{referenceStatus(check.observed, check.expected)}</span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="help">
                {!periods.length
                  ? 'Cadastre os períodos desta oferta para calcular.'
                  : 'Confirme a semana letiva e confira a organização e os períodos das ofertas para calcular.'}
              </p>
            )}
          </section>
        ))}
        <button
          type="button"
          className="teaching-day-close secondary"
          aria-label="Fechar detalhes"
          onClick={close}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </details>
  );
}

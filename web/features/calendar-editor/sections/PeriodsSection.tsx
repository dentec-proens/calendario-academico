import { calendarLimits } from '#src/domain/calendar/config.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import OfferOrganizationForm, {
  type OrganizationCheck,
  type RegisterOrganizationCheck,
} from '../forms/OfferOrganizationForm.tsx';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useActivitySearch } from '../events/activity-query.ts';
import { editorPages } from '../editor-steps.ts';
import { scrollIntoView } from '../../../scroll.ts';
import { Button } from '../../../components/ui/Button.tsx';
import { useFormDrafts } from '../../../shared/forms/drafts.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

export default function PeriodsSection() {
  const { state, formEpoch, record, readOnly } = useCalendarEditor();
  const drafts = useFormDrafts();
  const [showNew, setShowNew] = useState(() =>
    Boolean(drafts?.has(`calendar:${record.id}:organization:new`)),
  );
  const navigate = useNavigate();
  const checks = useRef(new Map<string, OrganizationCheck>());
  const [continuationError, setContinuationError] = useState('');
  const clearContinuationError = useCallback(() => setContinuationError(''), []);
  const registerCheck: RegisterOrganizationCheck = useCallback((modality, check) => {
    checks.current.set(modality, check);
    return () => {
      checks.current.delete(modality);
    };
  }, []);
  const { atividade } = useActivitySearch();
  const hash = useRouterState({ select: (router) => router.location.hash });
  useEffect(() => {
    if (hash !== 'assessment-area' || atividade) return;
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById('editor-section-title');
      heading?.focus({ preventScroll: true });
      scrollIntoView(heading, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, atividade]);
  return (
    <section id="periods" className="view">
      <section
        className="offer-organization-section"
        id="assessment-area"
        aria-labelledby="editor-section-title"
      >
        {state.periods.some((period) => period.association?.status !== 'defined') && (
          <p className="help">
            Há períodos existentes com associação a conferir. Ao configurar uma oferta, selecione o
            período correspondente para preservar suas datas.
          </p>
        )}
        {state.periods.some((period) => period.association?.status !== 'defined') && (
          <ul className="offer-unclassified">
            {state.periods
              .filter((period) => period.association?.status !== 'defined')
              .map((period) => (
                <li key={period.id}>
                  {period.name} · {period.start.split('-').reverse().join('/')} a{' '}
                  {period.end.split('-').reverse().join('/')}
                </li>
              ))}
          </ul>
        )}
        {state.offers.map((offer) => (
          <OfferOrganizationForm
            key={`${offer.id}:${formEpoch}`}
            offerId={offer.id}
            registerCheck={registerCheck}
            onResolved={clearContinuationError}
            requestedStage={
              atividade?.endsWith(`:${offer.id}`) && atividade.startsWith('stage-')
                ? atividade
                : undefined
            }
          />
        ))}
        {showNew && (
          <OfferOrganizationForm
            key={`new:${formEpoch}`}
            registerCheck={registerCheck}
            onResolved={() => {
              clearContinuationError();
              setShowNew(false);
              requestAnimationFrame(() => document.getElementById('add-offer')?.focus());
            }}
          />
        )}
        {!readOnly && (
          <Button
            id="add-offer"
            type="button"
            variant="secondary"
            disabled={showNew || state.offers.length >= calendarLimits.maximumOffers}
            onClick={() => setShowNew(true)}
          >
            Adicionar oferta
          </Button>
        )}
        {state.offers.length >= calendarLimits.maximumOffers && (
          <p className="help">
            Este calendário já contém o limite de {calendarLimits.maximumOffers} ofertas.
          </p>
        )}
      </section>
      <form
        id="organization-continue"
        onSubmit={(event) => {
          event.preventDefault();
          for (const check of checks.current.values()) {
            const pending = check();
            if (pending) {
              setContinuationError(pending.message);
              pending.reveal();
              return;
            }
          }
          setContinuationError('');
          void navigate({
            to: editorPages.days.path,
            params: { calendarId: record.id },
            search: (previous) => previous,
          });
        }}
      >
        {continuationError && (
          <Notice tone="warning" announce="assertive">
            {continuationError}
          </Notice>
        )}
      </form>
    </section>
  );
}

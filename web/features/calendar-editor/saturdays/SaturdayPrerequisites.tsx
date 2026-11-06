import { Link } from '@tanstack/react-router';
import { offerNames } from '#src/domain/calendar/offers.ts';
import { Notice } from '../../../components/ui/Notice.tsx';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { editorPages } from '../editor-steps.ts';

/**
 * What earlier steps still owe the Saturdays step, each with a link to the step that resolves it.
 * A Saturday cannot reach an offer without periods, and none can be selected when that is every
 * offer; without a confirmed week the count is unavailable.
 */
export default function SaturdayPrerequisites({
  calendarId,
  offersWithoutPeriods,
  weekConfirmed,
}: {
  calendarId: string;
  offersWithoutPeriods: readonly string[];
  weekConfirmed: boolean;
}) {
  const { state } = useCalendarEditor();
  const missing = offerNames(state, offersWithoutPeriods);
  const noneHasPeriods = offersWithoutPeriods.length === state.offers.length;
  const pending = [
    !weekConfirmed && {
      page: editorPages.edit,
      action: 'Confirme os dias regulares. Sem isso, a contagem de dias letivos não é calculada.',
    },
    offersWithoutPeriods.length > 0 && {
      page: editorPages.periods,
      action: noneHasPeriods
        ? `Cadastre o início e o término dos períodos de ${missing}. Só os sábados dentro deles podem ser selecionados.`
        : `${missing} sem período letivo. Cadastre o início e o término: até lá, os sábados não valem para ${offersWithoutPeriods.length === 1 ? 'esta oferta' : 'estas ofertas'}.`,
    },
  ].filter((item) => item !== false);
  if (!pending.length) return null;
  return (
    <Notice
      as="section"
      id="saturday-prerequisites"
      tone="warning"
      title={
        noneHasPeriods
          ? 'Nenhum sábado pode ser selecionado ainda'
          : offersWithoutPeriods.length
            ? 'Há oferta sem período letivo'
            : 'Falta confirmar a semana letiva'
      }
      titleAs="h4"
      titleProps={{ id: 'saturday-prerequisites-title' }}
      aria-labelledby="saturday-prerequisites-title"
    >
      <p>Conclua {pending.length === 1 ? 'este passo' : 'estes passos'} e volte para cá:</p>
      <ol>
        {pending.map(({ page, action }) => (
          <li key={page.section}>
            <Link to={page.path} params={{ calendarId }} data-prerequisite={page.section}>
              {page.title}
            </Link>{' '}
            — {action}
          </li>
        ))}
      </ol>
    </Notice>
  );
}

import { Link } from '@tanstack/react-router';
import { Notice } from '../../../components/ui/Notice.tsx';
import { editorPages } from '../editor-steps.ts';

/**
 * What earlier steps still owe the Saturdays step, each with a link to the step that resolves it.
 * Without periods no Saturday can be selected; without a confirmed week the count is unavailable.
 */
export default function SaturdayPrerequisites({
  calendarId,
  hasPeriods,
  weekConfirmed,
}: {
  calendarId: string;
  hasPeriods: boolean;
  weekConfirmed: boolean;
}) {
  const pending = [
    !weekConfirmed && {
      page: editorPages.edit,
      action: 'Confirme os dias regulares. Sem isso, a contagem de dias letivos não é calculada.',
    },
    !hasPeriods && {
      page: editorPages.periods,
      action:
        'Cadastre o início e o término dos períodos. Só os sábados dentro deles podem ser selecionados.',
    },
  ].filter((item) => item !== false);
  if (!pending.length) return null;
  return (
    <Notice
      as="section"
      id="saturday-prerequisites"
      tone="warning"
      title={
        hasPeriods ? 'Falta confirmar a semana letiva' : 'Nenhum sábado pode ser selecionado ainda'
      }
      titleAs="h4"
      titleProps={{ id: 'saturday-prerequisites-title' }}
      aria-labelledby="saturday-prerequisites-title"
    >
      <p>Conclua {pending.length === 1 ? 'esta etapa' : 'estas etapas'} e volte para cá:</p>
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

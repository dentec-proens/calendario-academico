import { Link } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';
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
      action:
        'Confirme os dias regulares e a referência da decisão. Sem isso, a contagem de dias letivos não é calculada.',
    },
    !hasPeriods && {
      page: editorPages.periods,
      action:
        'Cadastre o início e o término dos períodos. Só os sábados dentro deles podem ser selecionados.',
    },
  ].filter((item) => item !== false);
  if (!pending.length) return null;
  return (
    <section
      id="saturday-prerequisites"
      className="saturday-prerequisites"
      aria-labelledby="saturday-prerequisites-title"
    >
      <AlertTriangle aria-hidden="true" />
      <div>
        <h4 id="saturday-prerequisites-title">
          {hasPeriods
            ? 'Falta confirmar a semana letiva'
            : 'Nenhum sábado pode ser selecionado ainda'}
        </h4>
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
      </div>
    </section>
  );
}

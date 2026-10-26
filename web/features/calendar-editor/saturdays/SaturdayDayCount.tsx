import type { evaluateCalendar } from '../../../../src/evaluation.ts';
import { modalityLabels } from '../../../../src/modalities.ts';

const percent = (value: number, total: number) => `${Math.min(100, (value / total) * 100)}%`;

export default function SaturdayDayCount({
  evaluation,
  gain,
}: {
  evaluation: ReturnType<typeof evaluateCalendar> | null;
  gain: number;
}) {
  if (!evaluation)
    return (
      <p id="saturday-day-count" className="help">
        A contagem aparece depois de confirmar a semana letiva e cadastrar os períodos.
      </p>
    );
  const offers = Object.entries(evaluation.byModality);
  return (
    <div id="saturday-day-count">
      {offers.map(([modality, detail]) => {
        const annual = detail.checks.find((check) => check.scope === 'annual')!;
        const { observed, expected } = annual;
        return (
          <div key={modality} className="saturday-day-count">
            <p>
              {offers.length > 1 && <strong>{modalityLabels[modality] ?? modality}: </strong>}
              {expected === null
                ? `${observed} dias letivos`
                : `${observed} de ${expected} dias letivos`}
              {gain > 0 && <span> · com a seleção: {observed + gain}</span>}
            </p>
            {expected !== null && (
              <div className="saturday-day-count-bar" aria-hidden="true">
                <span style={{ width: percent(observed, expected) }} />
                <span className="is-preview" style={{ width: percent(gain, expected) }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

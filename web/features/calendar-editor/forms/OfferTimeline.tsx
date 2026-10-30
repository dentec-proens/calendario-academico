const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

interface Interval {
  start: string;
  end: string;
}

export interface TimelineCycle {
  period: Interval;
  stages: Interval[];
}

function dayOfYear(date: string, year: number) {
  const [y, m, d] = date.split('-').map(Number);
  if (y !== year || !m || !d) return null;
  return (Date.UTC(y, m - 1, d) - Date.UTC(year, 0, 1)) / 86_400_000;
}

/** Visual overview of one offer's periods and stages; the fields remain the accessible source. */
export function OfferTimeline({ year, cycles }: { year: number; cycles: TimelineCycle[] }) {
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  const span = ({ start, end }: Interval) => {
    const from = start ? dayOfYear(start, year) : null;
    const to = end ? dayOfYear(end, year) : null;
    if (from === null || to === null || to < from) return null;
    return { left: `${(from / days) * 100}%`, width: `${((to - from + 1) / days) * 100}%` };
  };
  const bars = cycles.flatMap((cycle, cycleIndex) => {
    const period = span(cycle.period);
    return [
      ...(period ? [{ key: `period-${cycleIndex}`, kind: 'period', style: period, text: '' }] : []),
      ...cycle.stages.flatMap((stage, stageIndex) => {
        const style = span(stage);
        if (!style) return [];
        const outside = !period || stage.start < cycle.period.start || stage.end > cycle.period.end;
        return [
          {
            key: `stage-${cycleIndex}-${stageIndex}`,
            kind: outside ? 'stage-outside' : stageIndex % 2 ? 'stage-alternate' : 'stage',
            style,
            text: `${stageIndex + 1}ª`,
          },
        ];
      }),
    ];
  });
  if (!bars.length) return null;
  return (
    <div className="offer-timeline" aria-hidden="true">
      <div className="offer-timeline-track">
        {bars.map((bar) => (
          <span key={bar.key} className="offer-timeline-bar" data-kind={bar.kind} style={bar.style}>
            {bar.text}
          </span>
        ))}
      </div>
      <div className="offer-timeline-months">
        {months.map((month) => (
          <span key={month}>{month}</span>
        ))}
      </div>
    </div>
  );
}

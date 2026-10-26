import { parseDate } from './calendar.ts';

export const HISTORY_EXTRACTOR_VERSION = 3;

const months = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function monthHeading(line: string) {
  const match = line
    .trim()
    .toLowerCase()
    .match(
      /^(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s*[-/–]?\s*\d{4})?$/,
    );
  return match ? months.indexOf(match[1]) + 1 : null;
}

export function headingYear(line: string) {
  return monthHeading(line) ? Number(line.match(/\b(\d{4})\b/)?.[1]) || null : null;
}

export function extractHistoricalDates(
  line: string,
  month: number | null = null,
  context: { headerYear?: number | null; documentYear?: number } = {},
) {
  if (/^\s*\d+\s+dias?\s+letivos?/i.test(line)) return null;
  // A leading day can be only the endpoint of an interval described later in the text.
  if (/\([^)]*\d{1,2}\/\d{1,2}\/\d{4}/.test(line)) return null;
  const m = line.match(
    /^\s*(\d{1,2})(?:[/.](\d{1,2})(?:[/.](\d{4}))?)?(?:\s*(?:a|até|–|-)\s*(\d{1,2})(?:[/.](\d{1,2})(?:[/.](\d{4}))?)?)?\s*[-–:]?\s+(.+)$/i,
  );
  if (!m) return null;
  const startMonth = Number(m[2] || m[5] || month),
    endMonth = Number(m[5] || startMonth),
    startDay = Number(m[1]),
    endDay = Number(m[4] || m[1]);
  // Numeric calendar grids, lists of dates and absent month context must not become events.
  if (!startMonth || !/[A-Za-zÀ-ÿ]{3}/.test(m[7]) || /^(?:e\s+\d|\d)/i.test(m[7])) return null;
  if (
    startDay < 1 ||
    endDay < 1 ||
    startDay > 31 ||
    endDay > 31 ||
    startMonth > 12 ||
    endMonth > 12
  )
    return null;
  return {
    startMonth,
    startDay,
    endMonth,
    endDay,
    name: m[7].slice(0, 160),
    sourceYear: m[3] ? Number(m[3]) : null,
    endYear: m[6] ? Number(m[6]) : null,
    headerYear: context.headerYear ?? null,
    yearSource: m[3]
      ? ('line' as const)
      : context.headerYear
        ? ('heading' as const)
        : context.documentYear
          ? ('document' as const)
          : ('unknown' as const),
    conflict: !!(
      (m[3] && context.headerYear && Number(m[3]) !== context.headerYear) ||
      (m[3] && context.documentYear && Number(m[3]) !== context.documentYear) ||
      (context.headerYear && context.documentYear && context.headerYear !== context.documentYear)
    ),
  };
}

export function proposedDates(
  _candidate: {
    name: string;
    dates?: Pick<HistoricalDates, 'startMonth' | 'startDay' | 'endMonth' | 'endDay'> | null;
  },
  _year: number,
) {
  return {
    start: '',
    end: '',
    warning:
      'Nova ocorrência: informe as datas e a fonte aplicável. As datas do PDF anterior não são transferidas para outro ano.',
  };
}

/** Original occurrence only: never replace an explicit year or invent an endpoint. */
export function originalDates(
  candidate: { name: string; dates?: Partial<HistoricalDates> | null },
  context: { documentYear?: number; analysisVersion?: number } = {},
) {
  const empty = (warning: string) => ({ start: '', end: '', warning });
  const d = candidate.dates;
  if (!d)
    return empty(
      'Data não reconhecida com segurança. Consulte o trecho e informe datas completas.',
    );
  if (
    d.conflict ||
    (d.sourceYear && context.documentYear && d.sourceYear !== context.documentYear) ||
    (d.headerYear && context.documentYear && d.headerYear !== context.documentYear)
  )
    return empty(
      'Há conflito entre o ano da linha, do cabeçalho ou do cadastro. Confira o PDF e informe as datas completas.',
    );
  // Old extractions discarded header years. The declared year cannot restore
  // information that was never retained; explicit dates remain usable.
  const trustedContext = (context.analysisVersion ?? 0) >= HISTORY_EXTRACTOR_VERSION;
  const startYear =
    d.sourceYear ?? (trustedContext ? (d.headerYear ?? context.documentYear) : undefined);
  const endYear =
    d.endYear ??
    (d.endMonth !== undefined && d.startMonth !== undefined && d.endMonth >= d.startMonth
      ? startYear
      : undefined);
  if (!startYear || !endYear || !d.startMonth || !d.startDay || !d.endMonth || !d.endDay)
    return empty(
      'Ano insuficiente para recuperar esta ocorrência. Reanalise o PDF disponível ou informe datas completas.',
    );
  const civil = (year: number, month: number, day: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const start = civil(startYear, d.startMonth, d.startDay),
    end = civil(endYear, d.endMonth, d.endDay);
  try {
    parseDate(start);
    parseDate(end);
  } catch {
    return empty('Data inexistente. Confira o PDF e informe as datas completas.');
  }
  if (end < start) return empty('Intervalo invertido. Confira o PDF e informe as datas completas.');
  return {
    start,
    end,
    warning:
      'Datas originais preservadas. Confirme a pertinência desta ocorrência ao calendário atual.',
  };
}

type ExtractedDates = NonNullable<ReturnType<typeof extractHistoricalDates>>;
export type HistoricalDates = Omit<ExtractedDates, 'headerYear' | 'yearSource' | 'conflict'> &
  Partial<Pick<ExtractedDates, 'headerYear' | 'yearSource' | 'conflict'>>;

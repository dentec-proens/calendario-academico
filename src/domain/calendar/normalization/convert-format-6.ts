/**
 * One-way conversion of a stored calendar document from format 5 to format 6, run only by the
 * format 6 migration. Pure and deterministic, with the shapes of format 5 frozen here so the rest
 * of the code knows only format 6. Every loss is returned in the report: the campus receives it.
 */
type Term = 'annual' | 'first' | 'second';
type Organization = 'anual' | 'semestral';

interface Format5Offer {
  id: string;
  kind: string;
  organization: Organization | 'a-classificar';
  stages?: { status: 'reported'; count: number } | { status: 'defined'; perTerm: number };
  intake?: Record<string, { status: string; required?: boolean }>;
  organizationBasis?: string;
  [key: string]: unknown;
}
interface Format5Period {
  id: string;
  name?: string;
  start: string;
  end: string;
  targetDays?: number;
  association: { status: 'a-classificar' } | { status: 'defined'; offers: string[]; term: Term };
  [key: string]: unknown;
}
type Format5Position =
  | { status: 'unclassified'; reportedOrdinal: number }
  | { status: 'defined'; term: Term; number: number };
interface Format5Event {
  id: string;
  name: string;
  start: string;
  end: string;
  effect: string;
  scope: { offers: string[]; confirmed: boolean };
  activity?: { activityId: string; offerId?: string; position?: Format5Position };
  deadlineAdjustment?: { date: string; reviewed?: boolean };
  notice?: { admission?: { destinations: { offerId: string; periodId: string }[] } };
  [key: string]: unknown;
}
interface Format5Snapshot {
  id: string;
  offers?: string[];
  modalities?: string[];
  deadlineAdjustment?: { date: string; reviewed?: boolean; evidence?: string };
  [key: string]: unknown;
}
export interface Format5State {
  schemaVersion: 5;
  offers: Format5Offer[];
  periods: Format5Period[];
  events: Format5Event[];
  [key: string]: unknown;
}

export interface ConversionReport {
  /** Offers whose organization the migration decided. */
  organizations: { offerId: string; organization: Organization; perTerm?: number }[];
  /** Unassociated periods removed, with the notices that named them as destination. */
  removedPeriods: { id: string; name?: string; start: string; end: string; notices: string[] }[];
  /** Local requirements of registration in a cycle the offer no longer has. */
  removedIntake: { offerId: string; term: string }[];
  /** Stage links given a position by the migration. */
  positions: { eventId: string; offerId: string; term: Term; number: number }[];
  /** School-day inclusions outside the periods of an offer, turned into notes. */
  downgradedInclusions: string[];
  /** Linked dates whose offers were not confirmed by the campus: they now count as fulfilment. */
  coverageWidened: string[];
  /** Snapshot entries whose offer kinds are not in the calendar. */
  removedSnapshotEntries: string[];
  /** Snapshot entries with an empty list, which now list every offer. */
  widenedSnapshotEntries: string[];
}

const emptyReport = (): ConversionReport => ({
  organizations: [],
  removedPeriods: [],
  removedIntake: [],
  positions: [],
  downgradedInclusions: [],
  coverageWidened: [],
  removedSnapshotEntries: [],
  widenedSnapshotEntries: [],
});

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const termsOf = (organization: string): Term[] =>
  organization === 'anual' ? ['annual'] : ['first', 'second'];
const unassociated = (period: Format5Period) => period.association.status === 'a-classificar';
const byDate = (a: Format5Period, b: Format5Period) =>
  a.start === b.start ? (a.id < b.id ? -1 : 1) : a.start < b.start ? -1 : 1;

/** Rule 1: fields with no use. The adjusted deadline itself stays. */
export function dropUnusedFields(state: Format5State): void {
  for (const offer of state.offers) delete offer.organizationBasis;
  for (const event of state.events)
    if (event.deadlineAdjustment)
      event.deadlineAdjustment = { date: event.deadlineAdjustment.date };
}

/**
 * Rule 2: every unclassified offer gets an organization from the unassociated periods of the
 * calendar. Exactly two without overlap are the semesters of format 4; an odd total cannot be split
 * in them, and decides by offer. The periods are bound to the semester offers here.
 */
export function organizeOffers(state: Format5State, report: ConversionReport): void {
  const pending = state.offers.filter((offer) => offer.organization === 'a-classificar');
  const periods = state.periods.filter(unassociated).sort(byDate);
  const semesters = periods.length === 2 && periods[0].end < periods[1].start ? periods : undefined;
  const semestral: string[] = [];
  for (const offer of pending) {
    const count = offer.stages?.status === 'reported' ? offer.stages.count : undefined;
    const split = semesters !== undefined && (count === undefined || count % 2 === 0);
    const organization: Organization = split ? 'semestral' : 'anual';
    const perTerm = count === undefined ? undefined : split ? count / 2 : count;
    offer.organization = organization;
    if (perTerm === undefined) delete offer.stages;
    else offer.stages = { status: 'defined', perTerm };
    if (split) semestral.push(offer.id);
    report.organizations.push({
      offerId: offer.id,
      organization,
      ...(perTerm === undefined ? {} : { perTerm }),
    });
  }
  if (!semestral.length || !semesters) return;
  semesters.forEach((period, index) => {
    period.association = {
      status: 'defined',
      offers: semestral,
      term: index === 0 ? 'first' : 'second',
    };
    delete period.targetDays;
  });
}

/**
 * Rule 3: the unassociated periods rule 2 did not take. One becomes the annual period the offers it
 * made annual share; any other is removed, since no offer can claim it.
 */
export function resolvePeriods(
  state: Format5State,
  decided: readonly string[],
  report: ConversionReport,
): void {
  const left = state.periods.filter(unassociated);
  const annual = state.offers
    .filter((offer) => decided.includes(offer.id) && offer.organization === 'anual')
    .map((offer) => offer.id);
  const [only] = left;
  if (left.length === 1 && only && annual.length) {
    only.association = { status: 'defined', offers: annual, term: 'annual' };
    delete only.targetDays;
    return;
  }
  for (const period of left)
    report.removedPeriods.push({
      id: period.id,
      ...(period.name === undefined ? {} : { name: period.name }),
      start: period.start,
      end: period.end,
      notices: state.events
        .filter((event) =>
          event.notice?.admission?.destinations.some(({ periodId }) => periodId === period.id),
        )
        .map((event) => event.id),
    });
  state.periods = state.periods.filter((period) => !unassociated(period));
}

/** Rule 4: only required cycles survive, and only those the offer's organization has. */
export function reduceIntake(state: Format5State, report: ConversionReport): void {
  for (const offer of state.offers) {
    if (!offer.intake) continue;
    const terms = termsOf(offer.organization);
    const kept = Object.entries(offer.intake).filter(([term, value]) => {
      if (value.required !== true) return false;
      if (terms.includes(term as Term)) return true;
      report.removedIntake.push({ offerId: offer.id, term });
      return false;
    });
    delete offer.intake;
    if (kept.length)
      (offer as Record<string, unknown>).intake = Object.fromEntries(
        kept.map(([term]) => [term, true]),
      );
  }
}

/**
 * Rule 5: a stage link never loses its date. An ordinal the organization has takes its position;
 * another takes one that is generated only if it comes to mean that same ordinal, and the date
 * stays under “Vínculo a conferir” until then.
 */
export function definePositions(state: Format5State, report: ConversionReport): void {
  for (const event of state.events) {
    const { activity } = event;
    if (activity?.position?.status !== 'unclassified' || !activity.offerId) continue;
    const ordinal = activity.position.reportedOrdinal;
    const offer = state.offers.find((item) => item.id === activity.offerId);
    const perTerm = offer?.stages?.status === 'defined' ? offer.stages.perTerm : undefined;
    const second =
      offer?.organization === 'semestral' &&
      perTerm !== undefined &&
      ordinal > perTerm &&
      ordinal <= 2 * perTerm;
    const term: Term =
      offer?.organization === 'semestral' ? (second ? 'second' : 'first') : 'annual';
    const number = second ? ordinal - perTerm : ordinal;
    activity.position = { status: 'defined', term, number };
    report.positions.push({ eventId: event.id, offerId: activity.offerId, term, number });
  }
}

function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  const last = Date.parse(`${end}T00:00:00Z`);
  for (let at = Date.parse(`${start}T00:00:00Z`); at <= last; at += 86_400_000)
    days.push(new Date(at).toISOString().slice(0, 10));
  return days;
}

/** Rule 6, local dates: `scope` becomes the plain list of offers; no confirmation remains. */
export function flattenEventScope(state: Format5State, report: ConversionReport): void {
  for (const event of state.events) {
    const { scope } = event;
    if (scope.confirmed === false && event.activity) report.coverageWidened.push(event.id);
    delete (event as Partial<Format5Event>).scope;
    (event as unknown as { offers: string[] }).offers = scope.offers;
  }
}

/**
 * Rule 6, institutional copy: the entry lists the offers it reaches, as `appliesTo` already reads
 * it. An empty list means every offer; an entry whose kinds have no offer reaches nobody and leaves.
 */
export function flattenSnapshot(
  snapshot: readonly Format5Snapshot[],
  offers: readonly Pick<Format5Offer, 'id' | 'kind'>[],
  report: ConversionReport,
): Format5Snapshot[] {
  const all = offers.map((offer) => offer.id);
  return snapshot.flatMap((entry) => {
    const { modalities, deadlineAdjustment, ...rest } = entry;
    const adjustment = deadlineAdjustment
      ? { deadlineAdjustment: { date: deadlineAdjustment.date } }
      : {};
    if (entry.offers?.length) return [{ ...rest, ...adjustment }];
    if (entry.offers || (modalities && !modalities.length)) {
      report.widenedSnapshotEntries.push(entry.id);
      return [{ ...rest, ...adjustment, offers: all }];
    }
    if (!modalities) return [{ ...rest, ...adjustment, offers: all }];
    const listed = offers
      .filter((offer) => modalities.includes(offer.kind))
      .map((offer) => offer.id);
    if (listed.length) return [{ ...rest, ...adjustment, offers: listed }];
    report.removedSnapshotEntries.push(entry.id);
    return [];
  });
}

/**
 * Rule 7: a school-day inclusion of an offer that was unclassified must fall in its periods, now
 * known.
 */
export function checkInclusions(
  state: Format5State,
  decided: readonly string[],
  report: ConversionReport,
): void {
  for (const event of state.events) {
    const { offers = [] } = event as unknown as { offers?: string[] };
    if (event.effect !== 'include' || !offers.some((id) => decided.includes(id))) continue;
    const inside = offers.every((id) =>
      daysBetween(event.start, event.end).every((day) =>
        state.periods.some(
          (period) =>
            period.association.status === 'defined' &&
            period.association.offers.includes(id) &&
            period.start <= day &&
            period.end >= day,
        ),
      ),
    );
    if (inside) continue;
    event.effect = 'note';
    report.downgradedInclusions.push(event.id);
  }
}

type Format6State = Omit<Format5State, 'schemaVersion'> & { schemaVersion: 6 };

export interface Format5Document {
  state: Format5State;
  institutionalSnapshot: Format5Snapshot[];
  [key: string]: unknown;
}

/** The rules of format 6, in order, over a whole content or submission. */
export function convertToFormat6<D extends Format5Document>(
  document: D,
): {
  document: Omit<D, 'state' | 'institutionalSnapshot'> & {
    state: Format6State;
    institutionalSnapshot: Format5Snapshot[];
  };
  report: ConversionReport;
} {
  const report = emptyReport();
  const state = copy(document.state);
  if (state.schemaVersion !== 5) throw new Error('O conversor do formato 6 só lê o formato 5.');
  const decided = state.offers
    .filter((offer) => offer.organization === 'a-classificar')
    .map((offer) => offer.id);
  dropUnusedFields(state);
  organizeOffers(state, report);
  resolvePeriods(state, decided, report);
  reduceIntake(state, report);
  definePositions(state, report);
  flattenEventScope(state, report);
  checkInclusions(state, decided, report);
  const institutionalSnapshot = flattenSnapshot(
    document.institutionalSnapshot,
    state.offers,
    report,
  );
  return {
    document: {
      ...document,
      state: { ...state, schemaVersion: 6 } as unknown as Format6State,
      institutionalSnapshot,
    },
    report,
  };
}

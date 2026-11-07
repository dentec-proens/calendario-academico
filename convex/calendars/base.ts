import { readActivityDates } from '../../src/domain/calendar/civil-dates.ts';
import { applicableEvents, inspectCalendar } from '../../src/domain/calendar/base';
import { rulesetVersion } from '../../src/domain/policies/registry';
import type { DomainState, documentSnapshot, institutionalEventSnapshot } from '../validators';
import type { Infer } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { catalogue } from '../catalogue/model';
import { clean } from '../lib/shared';

type Content = Pick<
  Doc<'calendarContents'>,
  'catalogueRevision' | 'institutionalSnapshot' | 'documentSnapshot'
>;
type Status = Doc<'calendars'>['status'];
type Snapshot = {
  rulesetVersion?: string;
  revision: number;
  events: ReturnType<typeof readActivityDates<Infer<typeof institutionalEventSnapshot>>>[];
  documents: Infer<typeof documentSnapshot>[];
};
function assess(status: Status, state: DomainState, content: Content, snapshot: Snapshot) {
  const assessment = inspectCalendar(
    {
      ...content,
      status,
      institutionalSnapshot: content.institutionalSnapshot.map(readActivityDates),
      state,
    },
    {
      currentCatalogueRevision: snapshot.revision,
      institutionalEvents: snapshot.events,
      currentRulesetVersion: snapshot.rulesetVersion,
    },
  );
  return {
    ...assessment,
    snapshot,
    dto: {
      revision: snapshot.revision,
      rulesetVersion: snapshot.rulesetVersion,
      events: snapshot.events,
    },
  };
}
export function inspectBase(
  status: Status,
  state: DomainState,
  content: Content,
  base: Awaited<ReturnType<typeof catalogue>>,
) {
  return assess(status, state, content, {
    rulesetVersion: rulesetVersion(state),
    revision: base.revision,
    events: (
      clean(applicableEvents(base, state)) as Infer<typeof institutionalEventSnapshot>[]
    ).map(readActivityDates),
    documents: content.documentSnapshot,
  });
}
/** A published calendar reads only the base frozen with its content. */
export function frozenBase(status: Status, state: DomainState, content: Content) {
  return assess(status, state, content, {
    rulesetVersion: state.rulesetVersion ?? rulesetVersion(state),
    revision: content.catalogueRevision,
    events: content.institutionalSnapshot.map(readActivityDates),
    documents: content.documentSnapshot,
  });
}

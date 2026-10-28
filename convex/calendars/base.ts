import { applicableEvents, inspectCalendar, reconcile } from '../../src/domain/calendar/base';
import { rulesetVersion } from '../../src/domain/calendar/policies/resolve';
import type { DomainState } from '../validators';
import type { Doc } from '../_generated/dataModel';
import type { catalogue } from '../catalogue/model';
import type { currentDocuments } from '../documents/model';
import { documentDto } from '../documents/model';
import { fail, clean } from '../lib/shared';

type Content = Pick<
  Doc<'calendarContents'>,
  'catalogueRevision' | 'institutionalSnapshot' | 'documentSnapshot'
>;
export function inspectBase(
  state: DomainState,
  content: Content,
  base: Awaited<ReturnType<typeof catalogue>>,
  docs: Awaited<ReturnType<typeof currentDocuments>>,
) {
  const snapshot = {
    rulesetVersion: rulesetVersion(state),
    revision: base.revision,
    events: clean(applicableEvents(base, state)),
    documents: docs,
  };
  const assessment = inspectCalendar(
    { ...content, state },
    {
      currentCatalogueRevision: snapshot.revision,
      institutionalEvents: snapshot.events,
      currentDocuments: snapshot.documents,
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
      documents: docs.map(documentDto),
    },
  };
}
export function reconcileBase(assessment: ReturnType<typeof inspectBase>, acceptance?: string) {
  try {
    return reconcile(assessment, acceptance);
  } catch (cause) {
    fail(cause instanceof Error ? cause.message : 'Não foi possível atualizar a base.', 409);
  }
}

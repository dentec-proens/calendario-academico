import { useEffect, useSyncExternalStore } from 'react';
import { useFormDrafts } from '../../../shared/forms/drafts.tsx';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

const noSubscription = () => () => {};

/**
 * A header form kept in the drafts while its panel is closed still holds unapplied work, which
 * the editor reports and which blocks the submission until it is saved or discarded.
 */
export function useUnappliedDraft(formId: string, draftKey: string) {
  const { session } = useCalendarEditor();
  const drafts = useFormDrafts();
  const editing = useSyncExternalStore(
    drafts?.subscribe ?? noSubscription,
    () => Boolean(drafts?.isEditing(draftKey)),
    () => false,
  );
  useEffect(() => {
    session.setFormDirty(formId, editing);
  }, [session, formId, editing]);
}

import { Undo2 } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { useSessionState } from '../../app/session.tsx';
import { useCalendarEditor } from './session/CalendarEditorProvider.tsx';

type Removal = NonNullable<ReturnType<typeof useCalendarEditor>['removal']>;
type Message = NonNullable<ReturnType<typeof useSessionState>['message']>;

/**
 * The editor's last message and its offer to undo a removal. A modal panel covers the page, so it
 * shows them too; each place decides which it shows.
 */
export default function EditorNotices({
  message,
  removal,
  onUndone,
  onDismissed,
}: {
  message: Message | null;
  removal: Removal | null;
  /** The undo button leaves with its notice: where focus continues. */
  onUndone: () => void;
  /** Inside a modal panel, the dismiss button must not take focus out of it as it leaves. */
  onDismissed?: () => void;
}) {
  const { dismissMessage } = useSessionState();
  const { undoRemoval, dismissRemoval } = useCalendarEditor();
  return (
    <>
      {message?.text ? (
        <Notice
          tone={message.error ? 'danger' : 'success'}
          elevated
          onDismiss={() => {
            dismissMessage();
            onDismissed?.();
          }}
        >
          {message.text}
        </Notice>
      ) : null}
      {removal ? (
        <Notice
          tone="success"
          elevated
          data-removal-notice
          onDismiss={() => {
            dismissRemoval();
            onDismissed?.();
          }}
          actions={
            <Button
              variant="secondary"
              data-undo-removal
              onClick={() => {
                undoRemoval();
                onUndone();
              }}
            >
              <Undo2 size={18} aria-hidden="true" /> Desfazer
            </Button>
          }
        >
          {removal.text}
        </Notice>
      ) : null}
    </>
  );
}

import { Undo2 } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { useSessionState } from '../../app/session.tsx';
import { useCalendarEditor } from './session/CalendarEditorProvider.tsx';

type Undoable = NonNullable<ReturnType<typeof useCalendarEditor>['undoable']>;
type Message = NonNullable<ReturnType<typeof useSessionState>['message']>;

/**
 * The editor's last message and its offer to undo a change. A modal panel covers the page, so it
 * shows them too; each place decides which it shows.
 */
export default function EditorNotices({
  message,
  undoable,
  onUndone,
  onDismissed,
}: {
  message: Message | null;
  undoable: Undoable | null;
  /** The undo button leaves with its notice: where focus continues. */
  onUndone: () => void;
  /** Inside a modal panel, the dismiss button must not take focus out of it as it leaves. */
  onDismissed?: () => void;
}) {
  const { dismissMessage } = useSessionState();
  const { undo, dismissUndo } = useCalendarEditor();
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
      {undoable ? (
        <Notice
          tone="success"
          elevated
          data-undo-notice
          onDismiss={() => {
            dismissUndo();
            onDismissed?.();
          }}
          actions={
            <Button
              variant="secondary"
              data-undo
              onClick={() => {
                undo();
                onUndone();
              }}
            >
              <Undo2 size={18} aria-hidden="true" /> Desfazer
            </Button>
          }
        >
          {undoable.text}
        </Notice>
      ) : null}
    </>
  );
}

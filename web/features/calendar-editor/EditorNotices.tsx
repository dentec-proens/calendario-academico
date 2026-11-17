import { useState } from 'react';
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

/**
 * What the page shows while a modal panel may cover it. A message stays where focus ends: while
 * the panel is up it shows the messages of its own actions, so the page holds them; once it closes,
 * the page shows only what the panel did not, such as the confirmation of the action that closed
 * it. The offer to undo returns to the page, where it stays available after the panel closes.
 */
export function usePageNotices(
  message: Message | null,
  undoable: Undoable | null,
  panelOpen: boolean,
): { message: Message | null; undoable: Undoable | null } {
  const [panel, setPanel] = useState({ open: panelOpen, message, shown: null as Message | null });
  // Opening takes the current message as the page's; later ones are the panel's while it is up.
  let next = panel;
  if (panelOpen !== next.open)
    next = panelOpen ? { ...next, open: true, message } : { ...next, open: false };
  if (panelOpen && message !== next.message && message !== next.shown)
    next = { ...next, shown: message };
  if (next !== panel) setPanel(next);
  if (panelOpen) return { message: null, undoable: null };
  return { message: message && message === next.shown ? null : message, undoable };
}
